import { prisma } from '../config/prisma';
import type { FileTokenPayload } from '../utils/jwt';
import { assertLessonAccess, assertCourseAccess } from './access.service';

export type FileKind = FileTokenPayload['kind'];
export type StoredFile = { id: string; url: string; name: string; hidden: boolean };
export type FileCheck = { file: StoredFile } | { status: number; error: string };

/**
 * Whether `userId` may open the file right now. Access (group membership,
 * granted lesson access, the file being hidden) is read from the live DB on
 * every call, never trusted from the time a link was issued.
 */
export async function checkFileAccess(fileId: string, kind: FileKind, userId: string, role: string): Promise<FileCheck> {
  if (kind === 'submission') {
    // A submission is the student's own work: only she and the teacher may open it.
    const submission = await prisma.submission.findUnique({ where: { id: fileId } });
    if (!submission?.fileUrl) return { status: 404, error: 'הקובץ לא נמצא' };
    if (role !== 'ADMIN' && submission.studentId !== userId) return { status: 403, error: 'אין לך הרשאה לקובץ זה' };
    return { file: { id: submission.id, url: submission.fileUrl, name: submission.fileName || 'הגשה', hidden: false } };
  }
  const file = kind === 'lesson'
    ? await prisma.lessonFile.findUnique({ where: { id: fileId } })
    : await prisma.courseFile.findUnique({ where: { id: fileId } });
  if (!file) return { status: 404, error: 'הקובץ לא נמצא' };
  if (role !== 'ADMIN' && file.hidden) return { status: 403, error: 'אין לך הרשאה לקובץ זה' };
  try {
    if (kind === 'lesson') {
      await assertLessonAccess(userId, role, (file as { lessonId: string }).lessonId);
    } else {
      await assertCourseAccess(userId, role, (file as { courseId: string }).courseId);
    }
  } catch {
    return { status: 403, error: 'אין לך הרשאה לקובץ זה' };
  }
  return { file };
}

/** The live role and token version of the user a file link was issued to, or null if the account is gone. */
export async function findFileTokenUser(userId: string): Promise<{ role: string; tokenVersion: number } | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: { role: true, tokenVersion: true } });
}
