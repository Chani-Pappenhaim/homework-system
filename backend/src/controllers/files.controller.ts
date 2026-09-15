import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verifyFileToken } from '../utils/jwt';
import { toDeliveryUrl } from '../utils/storage';

/**
 * Study-material links carry their own short-lived token instead of the
 * session's Authorization header (a plain <a>/<img>/<iframe> navigation can't
 * send one), so this route verifies that token itself and redirects to a
 * freshly signed Cloudinary URL rather than sitting behind the normal
 * session-auth middleware.
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

  res.redirect(toDeliveryUrl(file.url));
}
