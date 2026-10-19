import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { toFileDTO } from '../utils/storage';

/**
 * A lesson or a course can show a file already stored on the site - from any
 * lesson or course - without uploading it again. The new row points at the
 * same stored file, which is released only once no row uses it any more (see
 * releaseFileUrls), so deleting it from one place leaves it in the others.
 */

export type FileTarget = { kind: 'lesson'; id: string } | { kind: 'course'; id: string };
export type FileSource = 'lesson' | 'course';

export interface LinkableFile {
  source: FileSource;
  id: string;
  name: string;
  sizeBytes: string | null;
  courseName: string;
  /** The lesson it is in, for a lesson file. */
  lessonTopic: string | null;
}

async function targetUrls(target: FileTarget): Promise<Set<string>> {
  if (target.kind === 'lesson') {
    const lesson = await prisma.lesson.findUnique({ where: { id: target.id }, select: { files: { select: { url: true } } } });
    if (!lesson) throw new AppError('Lesson not found', 'השיעור לא נמצא', 404);
    return new Set(lesson.files.map((f) => f.url));
  }
  const course = await prisma.course.findUnique({ where: { id: target.id }, select: { files: { select: { url: true } } } });
  if (!course) throw new AppError('Course not found', 'הקורס לא נמצא', 404);
  return new Set(course.files.map((f) => f.url));
}

/** Every stored file the target does not show yet, newest first, each stored file once. */
export async function listLinkableFiles(target: FileTarget): Promise<LinkableFile[]> {
  const have = await targetUrls(target);
  const [lessonFiles, courseFiles] = await Promise.all([
    prisma.lessonFile.findMany({
      orderBy: { uploadedAt: 'desc' },
      select: { id: true, name: true, url: true, sizeBytes: true, uploadedAt: true, lesson: { select: { topic: true, course: { select: { name: true } } } } },
    }),
    prisma.courseFile.findMany({
      orderBy: { uploadedAt: 'desc' },
      select: { id: true, name: true, url: true, sizeBytes: true, uploadedAt: true, course: { select: { name: true } } },
    }),
  ]);
  const all = [
    ...lessonFiles.map((f) => ({ ...f, source: 'lesson' as const, courseName: f.lesson.course.name, lessonTopic: f.lesson.topic })),
    ...courseFiles.map((f) => ({ ...f, source: 'course' as const, courseName: f.course.name, lessonTopic: null })),
  ].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  const seen = new Set(have);
  const result: LinkableFile[] = [];
  for (const f of all) {
    if (seen.has(f.url)) continue;
    seen.add(f.url);
    result.push({
      source: f.source, id: f.id, name: f.name, sizeBytes: f.sizeBytes?.toString() ?? null,
      courseName: f.courseName, lessonTopic: f.lessonTopic,
    });
  }
  return result;
}

/** Shows a stored file in the target too, under its current name. */
export async function linkFile(target: FileTarget, source: unknown, fileId: unknown, userId: string) {
  if ((source !== 'lesson' && source !== 'course') || typeof fileId !== 'string' || !fileId) {
    throw new AppError('Invalid file to link', 'יש לבחור קובץ', 400);
  }
  const file = source === 'lesson'
    ? await prisma.lessonFile.findUnique({ where: { id: fileId }, select: { name: true, url: true, sizeBytes: true } })
    : await prisma.courseFile.findUnique({ where: { id: fileId }, select: { name: true, url: true, sizeBytes: true } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא - ייתכן שנמחק', 404);

  if ((await targetUrls(target)).has(file.url)) {
    throw new AppError('File already linked', target.kind === 'lesson' ? 'הקובץ כבר מופיע בשיעור הזה' : 'הקובץ כבר מופיע בקורס הזה', 409);
  }
  const data = { name: file.name, url: file.url, sizeBytes: file.sizeBytes };
  const created = target.kind === 'lesson'
    ? await prisma.lessonFile.create({ data: { lessonId: target.id, ...data } })
    : await prisma.courseFile.create({ data: { courseId: target.id, ...data } });
  return toFileDTO(created, target.kind, userId);
}
