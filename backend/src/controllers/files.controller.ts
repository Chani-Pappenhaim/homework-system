import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { REFRESH_COOKIE, signFileToken, verifyFileToken, verifyRefreshToken } from '../utils/jwt';
import { fileDownloadPath, fileExtension, toDeliveryUrl } from '../utils/storage';
import { discardPendingUpload } from '../services/pending-uploads.service';
import { checkFileAccess, findFileTokenUser } from '../services/file-access.service';
import { contentDisposition, ensureExtension, extensionOf, resolveContentType } from '../utils/mime';

// Types a browser executes as a document when opened directly; a script in one would run on the
// API's origin, where the refresh cookie lives, so they are served under a sandbox CSP.
const SCRIPTABLE = ['svg', 'html', 'htm', 'xhtml', 'xml'];

/**
 * Drops helmet's framing headers for file responses, since the SPA lives on another origin and
 * must embed files (e.g. a PDF in an iframe); scriptable types are sandboxed instead.
 */
function applyEmbeddingHeaders(res: Response, name: string) {
  res.removeHeader('X-Frame-Options');
  if (SCRIPTABLE.includes(extensionOf(name))) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  } else {
    res.removeHeader('Content-Security-Policy');
  }
}

/** Whether the request carries a valid refresh cookie of `userId`'s session, not revoked by a password change. */
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
 * Serves a stored file. Links carry their own short-lived token, since a plain <a>/<img>/<iframe>
 * cannot send an Authorization header. The token alone is not enough: the browser must also send
 * the session cookie of the user it was issued to, so a copied link is useless to anyone else.
 * Only an `external` token (for an online document viewer, valid five minutes) skips the cookie.
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

  // Proxied instead of redirecting to the Cloudinary CDN: a cross-origin redirect makes browsers
  // ignore <a download> and can block <audio>/<video>, and Cloudinary's own Content-Type and
  // Content-Disposition cannot be trusted.
  const deliveryUrl = toDeliveryUrl(file.url);
  // Media elements probe with a Range request, so it is forwarded and the partial response
  // mirrored back; advertising Accept-Ranges without honoring it stops playback in some browsers.
  const rangeHeader = req.headers.range;
  let upstream = await fetch(deliveryUrl, rangeHeader ? { headers: { Range: rangeHeader } } : undefined);
  // The Netfree filter answers a ranged request with a 418 block page; retry for the whole file,
  // losing only seeking. Scoped to 418 so real Cloudinary failures do not turn a 206 into a 200.
  if (upstream.status === 418 && rangeHeader) {
    console.warn('[files] ranged request blocked upstream (418), retrying whole file');
    upstream = await fetch(deliveryUrl);
  }
  if (!upstream.ok || !upstream.body) {
    res.status(502).json({ success: false, error: 'שגיאה בטעינת הקובץ' });
    return;
  }

  const asAttachment = req.query.dl === '1';
  // The stored display name may lack the extension, which would give downloads no openable type.
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

  // Headers are already sent, so a mid-stream failure can only be logged and the connection cut;
  // closing either side tears down the other.
  const body = Readable.fromWeb(upstream.body as never);
  body.on('error', (streamErr) => {
    console.error('[files] stream failed mid-response', streamErr);
    res.destroy();
  });
  res.on('close', () => body.destroy());
  body.pipe(res);
}

/** A short-lived link for an online Office viewer, which sends no session cookie; issued only to a signed-in reader who may open the file. */
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
