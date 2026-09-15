import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verifyFileToken } from '../utils/jwt';
import { toDeliveryUrl } from '../utils/storage';
import { assertLessonAccess, assertCourseAccess } from '../utils/access';

/**
 * Study-material links carry their own short-lived token instead of the
 * session's Authorization header (a plain <a>/<img>/<iframe> navigation can't
 * send one), so this route verifies that token itself and redirects to a
 * freshly signed Cloudinary URL rather than sitting behind the normal
 * session-auth middleware.
 *
 * The token proves who asked and for which file, but access itself (group
 * membership / granted lesson access) is re-checked here against the live DB
 * on every download — not trusted from token issue time — so a student whose
 * access was revoked after the link was generated can't still use it during
 * the token's 15-minute window.
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

  const file = payload.kind === 'lesson'
    ? await prisma.lessonFile.findUnique({ where: { id: fileId } })
    : await prisma.courseFile.findUnique({ where: { id: fileId } });

  if (!file) {
    res.status(404).json({ success: false, error: 'הקובץ לא נמצא' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true } });
  if (!user) {
    res.status(401).json({ success: false, error: 'קישור לא תקין' });
    return;
  }

  try {
    if (payload.kind === 'lesson') {
      await assertLessonAccess(payload.userId, user.role, (file as { lessonId: string }).lessonId);
    } else {
      await assertCourseAccess(payload.userId, user.role, (file as { courseId: string }).courseId);
    }
  } catch {
    res.status(403).json({ success: false, error: 'אין לך הרשאה לקובץ זה' });
    return;
  }

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
  const upstream = await fetch(deliveryUrl, rangeHeader ? { headers: { Range: rangeHeader } } : undefined);
  if (!upstream.ok || !upstream.body) {
    res.status(502).json({ success: false, error: 'שגיאה בטעינת הקובץ' });
    return;
  }

  const asAttachment = req.query.dl === '1';
  const encodedName = encodeURIComponent(file.name);
  res.setHeader(
    'Content-Disposition',
    `${asAttachment ? 'attachment' : 'inline'}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`
  );
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Accept-Ranges', 'bytes');

  if (upstream.status === 206) {
    res.status(206);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
  }

  const { Readable } = await import('node:stream');
  Readable.fromWeb(upstream.body as never).pipe(res);
}
