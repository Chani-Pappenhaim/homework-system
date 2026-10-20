import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { REFRESH_COOKIE, signFileToken, verifyFileToken, verifyRefreshToken } from '../utils/jwt';
import { fileDownloadPath, fileExtension, toDeliveryUrl } from '../utils/storage';
import { discardPendingUpload } from '../utils/pending-uploads';
import { checkFileAccess, findFileTokenUser } from '../services/file-access.service';
import { contentDisposition, ensureExtension, extensionOf, resolveContentType } from '../utils/mime';

// Types a browser will execute as a document if it is opened directly. The
// files come from people we trust, but "trusted" is not "audited", and a script
// inside one would run on the API's own origin — where the refresh cookie
// lives. A sandbox CSP renders them without ever running their scripts.
const SCRIPTABLE = ['svg', 'html', 'htm', 'xhtml', 'xml'];

/**
 * helmet's clickjacking guard (`X-Frame-Options: SAMEORIGIN` plus a CSP with
 * `frame-ancestors 'self'`) is right for every JSON route here and wrong for
 * this one: the SPA is served from another origin, so those headers stop it
 * from putting a PDF in an <iframe> at all. A file response drops them and
 * sandboxes the handful of types where framing would actually be dangerous.
 */
function applyEmbeddingHeaders(res: Response, name: string) {
  res.removeHeader('X-Frame-Options');
  if (SCRIPTABLE.includes(extensionOf(name))) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  } else {
    res.removeHeader('Content-Security-Policy');
  }
}

/**
 * Whether the request comes from a signed-in session of `userId`: the refresh
 * cookie, still valid and not revoked by a later password change.
 */
function sessionBelongsTo(req: Request, userId: string, tokenVersion: number): boolean {
  const cookie = req.cookies?.[REFRESH_COOKIE];
  if (typeof cookie !== 'string') return false;
  try {
    const session = verifyRefreshToken(cookie);
    return session.userId === userId && (session.tokenVersion ?? 0) === tokenVersion;
  } catch {
    return false;
  }
}

/**
 * Study-material links carry their own short-lived token instead of the
 * session's Authorization header (a plain <a>/<img>/<iframe> navigation can't
 * send one), so this route verifies that token itself rather than sitting
 * behind the normal session-auth middleware.
 *
 * The token alone used to be the whole credential, so a link copied out of the
 * page opened the file for anyone, signed in or not, until it expired. The
 * browser also has to send the session cookie of the user the link was issued
 * to. Only an `external` token, minted on demand for an online document viewer
 * that fetches from its own servers, goes without one; it lives five minutes.
 */
export async function download(req: Request, res: Response) {
  const { fileId } = req.params;
  const { token } = req.query;

  if (typeof token !== 'string') {
    res.status(401).json({ success: false, error: 'קישור לא תקין' });
    return;
  }

  let payload;
  try {
    payload = verifyFileToken(token);
  } catch {
    res.status(401).json({ success: false, error: 'הקישור פג תוקף, יש לפתוח את הדף מחדש' });
    return;
  }

  if (payload.fileId !== fileId) {
    res.status(401).json({ success: false, error: 'קישור לא תקין' });
    return;
  }

  const user = await findFileTokenUser(payload.userId);
  if (!user) {
    res.status(401).json({ success: false, error: 'קישור לא תקין' });
    return;
  }

  if (!payload.external && !sessionBelongsTo(req, payload.userId, user.tokenVersion)) {
    res.status(401).json({ success: false, error: 'יש להתחבר לאתר כדי לפתוח את הקובץ' });
    return;
  }

  const check = await checkFileAccess(fileId, payload.kind, payload.userId, user.role);
  if ('status' in check) {
    res.status(check.status).json({ success: false, error: check.error });
    return;
  }
  const { file } = check;

  // Proxied through our own origin instead of a bare redirect to the Cloudinary
  // CDN: a cross-origin redirect target makes the browser ignore <a download>
  // (it just navigates/opens the file instead of saving it), and some browsers'
  // stricter CORS/referrer policies block <audio>/<video> from a redirected
  // cross-origin source outright. Streaming the bytes ourselves gives one
  // reliable behavior for both preview and download, and lets us always send a
  // correct Content-Type/Content-Disposition (Cloudinary's own headers can't be
  // trusted for either — resource_type 'auto' doesn't guarantee it).
  const deliveryUrl = toDeliveryUrl(file.url);
  // <audio>/<video> elements probe with a Range request before they'll play
  // anything (needed to read duration/seek without pulling the whole file) —
  // forwarding the browser's own Range header to Cloudinary and mirroring back
  // whatever partial-content response it gives is required, not optional:
  // advertising Accept-Ranges without actually honoring Range requests makes
  // several browsers refuse to play the media at all instead of falling back
  // to a full download.
  const rangeHeader = req.headers.range;
  let upstream = await fetch(deliveryUrl, rangeHeader ? { headers: { Range: rangeHeader } } : undefined);
  // Some networks in between refuse a ranged request outright rather than
  // passing it on — the Netfree filter on the developer network answers one
  // with its block page under status 418. Falling back to the whole file costs
  // seeking, but it beats a media element that will not play at all.
  // Scoped to 418 specifically (not any !upstream.ok) — a broader check also
  // caught real Cloudinary failures (a dropped connection, a transient 5xx)
  // and silently swapped the browser's expected 206 partial response for a
  // full 200 body, which is what actually broke video playback that used to
  // work: the retry fired on failures that had nothing to do with a filter.
  if (upstream.status === 418 && rangeHeader) {
    console.warn('[files] ranged request blocked upstream (418), retrying whole file');
    upstream = await fetch(deliveryUrl);
  }
  if (!upstream.ok || !upstream.body) {
    res.status(502).json({ success: false, error: 'שגיאה בטעינת הקובץ' });
    return;
  }

  const asAttachment = req.query.dl === '1';
  // The upload form defaults a file's display name to the filename *without*
  // its extension, so a file the teacher named herself is stored as "contract"
  // while the asset behind it is a PDF. Sending that name verbatim is what
  // produced downloads called "contract" that no program would open.
  const downloadName = ensureExtension(file.name, file.url);
  res.setHeader('Content-Disposition', contentDisposition(downloadName, asAttachment ? 'attachment' : 'inline'));
  res.setHeader('Content-Type', resolveContentType(upstream.headers.get('content-type'), downloadName));
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Accept-Ranges', 'bytes');
  applyEmbeddingHeaders(res, downloadName);

  if (upstream.status === 206) {
    res.status(206);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
  }

  // Headers are already on the wire, so a failure from here on cannot become an
  // error response — it can only be logged and the connection cut. Both sides
  // are wired up: a stalled upstream must not hold the socket open, and a
  // reader who closes the tab must not leave us pulling bytes.
  const body = Readable.fromWeb(upstream.body as never);
  body.on('error', (streamErr) => {
    console.error('[files] stream failed mid-response', streamErr);
    res.destroy();
  });
  res.on('close', () => body.destroy());
  body.pipe(res);
}

/**
 * A link an online Office viewer can fetch: it carries no session cookie, so
 * it gets a token of its own, issued only to a signed-in reader who may open
 * the file and valid for just the few minutes the viewer needs to load it.
 */
export async function viewerLink(req: Request, res: Response) {
  const { fileId, kind } = req.body ?? {};
  if (typeof fileId !== 'string' || (kind !== 'lesson' && kind !== 'course')) {
    res.status(400).json({ success: false, error: 'בקשה לא תקינה' });
    return;
  }
  const { userId, role } = req.user!;
  const check = await checkFileAccess(fileId, kind, userId, role);
  if ('status' in check) {
    res.status(check.status).json({ success: false, error: check.error });
    return;
  }
  const token = signFileToken({ fileId, kind, userId, external: true });
  res.json({ success: true, data: { url: fileDownloadPath(fileId, fileExtension(check.file), token) } });
}

export async function discardUpload(req: Request, res: Response) {
  const url = req.body?.url;
  if (typeof url !== 'string' || !url) {
    res.status(400).json({ success: false, error: 'חסרה כתובת קובץ' });
    return;
  }
  const removed = await discardPendingUpload(url, req.user!.userId);
  res.json({ success: true, data: { removed } });
}
