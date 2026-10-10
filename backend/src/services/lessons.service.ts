import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { uploadBuffer, createUploadSignature, toFileDTO, destroyByUrl, isOwnUpload } from '../utils/storage';
import { confirmUpload, discardPendingUpload } from '../utils/pending-uploads';
import { releaseFileUrls, submissionFileUrls } from '../utils/file-refs';
import { assertLessonAccess, assertCourseAccess } from '../utils/access';

// Older lessons only have the legacy single `githubUrl` column populated;
// `githubUrls` is the source of truth, so fall back to wrapping the legacy
// value when it's empty.
function effectiveGithubUrls(l: { githubUrl: string | null; githubUrls: string[] }): string[] {
  if (l.githubUrls.length > 0) return l.githubUrls;
  return l.githubUrl ? [l.githubUrl] : [];
}

function cleanGithubUrls(urls?: string[]): string[] | undefined {
  if (!urls) return undefined;
  return urls.map((u) => u.trim()).filter(Boolean);
}

export async function getLessons(courseId: string, userId: string, role: string) {
  await assertCourseAccess(userId, role, courseId);
  const lessons = await prisma.lesson.findMany({
    where: { courseId, ...(role !== 'ADMIN' && { hidden: false }) },
    include: { _count: { select: { assignments: true } } },
    orderBy: { order: 'asc' },
  });
  return lessons.map((l) => ({
    id: l.id, topic: l.topic, lessonDate: l.lessonDate,
    hidden: l.hidden, order: l.order, githubUrls: effectiveGithubUrls(l),
    assignmentCount: l._count.assignments,
  }));
}

export async function createLesson(courseId: string, data: {
  topic: string; lessonDate?: string; contentMd?: string;
  githubUrls?: string[]; hidden?: boolean; order?: number;
}) {
  const { lessonDate, githubUrls, ...rest } = data;
  return prisma.lesson.create({
    data: {
      courseId,
      ...rest,
      githubUrls: cleanGithubUrls(githubUrls) ?? [],
      ...(lessonDate ? { lessonDate: new Date(lessonDate) } : {}),
    },
  });
}

export async function getLessonById(id: string, userId: string, role: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      files: { where: role === 'ADMIN' ? {} : { hidden: false } },
      assignments: true,
      quiz: { select: { published: true } },
    },
  });
  if (!lesson) return null;

  await assertLessonAccess(userId, role, id);

  const progress = await prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: userId, lessonId: id } },
  });
  // aiInstructions is the teacher's private prompt to the AI — never ship it to a student.
  const assignments = role === 'ADMIN'
    ? lesson.assignments
    : lesson.assignments.map(({ aiInstructions, ...rest }) => rest);

  // A student must not learn that an unpublished quiz draft exists, so for
  // them `quiz` collapses to "is there a quiz I can take?".
  const { quiz, ...lessonFields } = lesson;
  const quizState = role === 'ADMIN'
    ? { exists: Boolean(quiz), published: quiz?.published ?? false }
    : { exists: Boolean(quiz?.published), published: Boolean(quiz?.published) };

  // Students need to know which required files they've already marked as seen,
  // so the "finish lesson" gate can be shown accurately before they even try it.
  const viewedFileIds = role === 'ADMIN'
    ? new Set<string>()
    : new Set(
        (await prisma.lessonFileView.findMany({
          where: { studentId: userId, fileId: { in: lesson.files.map((f) => f.id) } },
          select: { fileId: true },
        })).map((v) => v.fileId)
      );

  return {
    ...lessonFields,
    assignments,
    githubUrls: effectiveGithubUrls(lesson),
    completed: Boolean(progress),
    files: lesson.files.map((f) => ({ ...toFileDTO(f, 'lesson', userId), viewed: viewedFileIds.has(f.id) })),
    quiz: quizState,
  };
}

async function assertRequiredFilesViewed(studentId: string, lessonId: string) {
  // A hidden file can't be opened, so it can't hold the lesson back either.
  const requiredFiles = await prisma.lessonFile.findMany({
    where: { lessonId, required: true, hidden: false },
    select: { id: true, name: true },
  });
  if (requiredFiles.length === 0) return;

  const viewed = await prisma.lessonFileView.findMany({
    where: { studentId, fileId: { in: requiredFiles.map((f) => f.id) } },
    select: { fileId: true },
  });
  const viewedIds = new Set(viewed.map((v) => v.fileId));
  const missing = requiredFiles.filter((f) => !viewedIds.has(f.id));
  if (missing.length > 0) {
    throw new AppError(
      `Required files not yet viewed: ${missing.map((f) => f.name).join(', ')}`,
      `יש לסמן את הקבצים הבאים כנצפו לפני סיום השיעור: ${missing.map((f) => f.name).join(', ')}`,
      400
    );
  }
}

export async function markLessonFileViewed(studentId: string, role: string, lessonId: string, fileId: string) {
  await assertLessonAccess(studentId, role, lessonId);
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  await prisma.lessonFileView.upsert({
    where: { studentId_fileId: { studentId, fileId } },
    create: { studentId, fileId },
    update: {},
  });
}

export async function unmarkLessonFileViewed(studentId: string, role: string, lessonId: string, fileId: string) {
  await assertLessonAccess(studentId, role, lessonId);
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  await prisma.lessonFileView.deleteMany({ where: { studentId, fileId } });
  // A required file being un-viewed breaks the "all required files viewed"
  // gate the lesson was marked complete under, so completion must be undone too.
  if (file.required) {
    await prisma.lessonProgress.deleteMany({ where: { studentId, lessonId } });
  }
}

export async function setLessonFileRequired(lessonId: string, fileId: string, required: boolean, userId: string) {
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  const updated = await prisma.lessonFile.update({ where: { id: fileId }, data: { required } });
  return toFileDTO(updated, 'lesson', userId);
}

export async function setLessonFileHidden(lessonId: string, fileId: string, hidden: boolean, userId: string) {
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  const updated = await prisma.lessonFile.update({ where: { id: fileId }, data: { hidden } });
  return toFileDTO(updated, 'lesson', userId);
}

/**
 * Copies a lesson — its content, files, assignments and quiz — to the end of a
 * course: the same course (a duplicate) or another one. Files point at the same
 * stored assets rather than new uploads (deletes count references, see
 * utils/file-refs). The copy starts hidden so students don't see a lesson the
 * teacher hasn't finished adapting, and its quiz starts as an unpublished draft.
 */
export async function copyLesson(lessonId: string, targetCourseId?: string) {
  const source = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { files: true, assignments: true, quiz: true },
  });
  if (!source) throw new AppError('Lesson not found', 'השיעור לא נמצא', 404);

  const courseId = targetCourseId || source.courseId;
  const target = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!target) throw new AppError('Course not found', 'הקורס לא נמצא', 404);

  const last = await prisma.lesson.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
  const sameCourse = courseId === source.courseId;

  return prisma.lesson.create({
    data: {
      courseId,
      topic: sameCourse ? `${source.topic} (עותק)` : source.topic,
      lessonDate: source.lessonDate,
      contentMd: source.contentMd,
      githubUrl: source.githubUrl,
      githubUrls: source.githubUrls,
      hidden: true,
      order: (last?.order ?? -1) + 1,
      files: {
        create: source.files.map((f) => ({
          name: f.name, url: f.url, sizeBytes: f.sizeBytes, required: f.required, hidden: f.hidden,
        })),
      },
      assignments: {
        create: source.assignments.map((a) => ({
          title: a.title, description: a.description, deadline: a.deadline,
          allowedTypes: a.allowedTypes, allowGithub: a.allowGithub, allowFile: a.allowFile,
          requirements: a.requirements ?? undefined, aiInstructions: a.aiInstructions,
        })),
      },
      ...(source.quiz ? { quiz: { create: { questions: source.quiz.questions ?? [], published: false } } } : {}),
    },
  });
}

export async function setLessonProgress(studentId: string, lessonId: string, completed: boolean, role = 'STUDENT') {
  // Without this a student could mark progress on a hidden lesson or one
  // from another group just by knowing its id.
  await assertLessonAccess(studentId, role, lessonId);
  if (completed) {
    await assertRequiredFilesViewed(studentId, lessonId);
    await prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      create: { studentId, lessonId },
      update: {},
    });
  } else {
    await prisma.lessonProgress.deleteMany({ where: { studentId, lessonId } });
  }
  return { lessonId, completed };
}

type LessonUpdate = Partial<{
  topic: string; lessonDate: string | null; contentMd: string;
  githubUrls: string[]; hidden: boolean;
}>;

function parseLessonDate(value: unknown): Date | null {
  if (value === null || value === '') return null;
  const date = new Date(value as string);
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) {
    throw new AppError('Invalid lesson date', 'תאריך השיעור אינו תקין', 400);
  }
  return date;
}

// Only these fields come from the request; the course and the order are
// changed through their own flows (copy, reorder), never through a PATCH body.
export async function updateLesson(id: string, data: LessonUpdate) {
  const body = (data ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (body.topic !== undefined) {
    if (typeof body.topic !== 'string' || !body.topic.trim()) {
      throw new AppError('Topic is required', 'יש להזין נושא לשיעור', 400);
    }
    update.topic = body.topic.trim();
  }
  if (body.lessonDate !== undefined) update.lessonDate = parseLessonDate(body.lessonDate);
  if (body.contentMd !== undefined) update.contentMd = typeof body.contentMd === 'string' ? body.contentMd : '';
  if (typeof body.hidden === 'boolean') update.hidden = body.hidden;
  if (Array.isArray(body.githubUrls)) update.githubUrls = cleanGithubUrls(body.githubUrls as string[]);
  return prisma.lesson.update({ where: { id }, data: update });
}

export async function reorderLessons(lessons: { id: string; order: number }[]) {
  const valid = Array.isArray(lessons) && lessons.length > 0
    && lessons.every((l) => l && typeof l.id === 'string' && Number.isInteger(l.order));
  if (!valid) throw new AppError('Invalid lesson order', 'רשימת הסדר אינה תקינה', 400);

  const ids = [...new Set(lessons.map((l) => l.id))];
  const found = await prisma.lesson.findMany({ where: { id: { in: ids } }, select: { courseId: true } });
  if (found.length !== ids.length) throw new AppError('Lesson not found', 'חלק מהשיעורים לא נמצאו', 404);
  if (new Set(found.map((l) => l.courseId)).size > 1) {
    throw new AppError('Lessons from several courses', 'אפשר לסדר רק שיעורים של אותו קורס', 400);
  }

  // All or nothing, so a dropped connection can't leave half a new order.
  await prisma.$transaction(
    lessons.map((l) => prisma.lesson.update({ where: { id: l.id }, data: { order: l.order } }))
  );
}

// Signed params for a direct browser-to-Cloudinary upload — the file's bytes
// never pass through this server, avoiding extra outbound bandwidth.
export function getLessonUploadSignature(userId: string) {
  return createUploadSignature('lessons', { uploaderId: userId });
}

export async function uploadLessonFile(
  lessonId: string,
  file: { buffer: Buffer; mimeType: string; originalName: string } | { url: string; bytes: number; originalName: string },
  displayName: string | undefined,
  userId: string
) {
  const direct = !('buffer' in file);
  if (direct && !isOwnUpload(file.url, 'lessons')) {
    throw new AppError('Uploaded file URL is not ours', 'כתובת הקובץ שהועלה אינה תקינה', 400);
  }
  const { url, bytes } = 'buffer' in file
    ? await uploadBuffer(file.buffer, file.mimeType, 'lessons', file.originalName)
    : file;
  try {
    const created = await prisma.lessonFile.create({
      data: { lessonId, name: displayName?.trim() || file.originalName, url, sizeBytes: bytes },
    });
    if (direct) await confirmUpload(url);
    return toFileDTO(created, 'lesson', userId);
  } catch (err) {
    // Not saved, so nothing will ever point at the stored file.
    if (direct) await discardPendingUpload(url, userId);
    else await destroyByUrl(url).catch((e) => console.error('[storage] cleanup failed:', url, e));
    throw err;
  }
}

export async function deleteLessonFile(lessonId: string, fileId: string) {
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  await prisma.lessonFile.delete({ where: { id: fileId } });
  await releaseFileUrls([file.url]);
}

export async function renameLessonFile(lessonId: string, fileId: string, name: string, userId: string) {
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('Name is required', 'יש להזין שם', 400);
  const updated = await prisma.lessonFile.update({ where: { id: fileId }, data: { name: trimmed } });
  return toFileDTO(updated, 'lesson', userId);
}

// Deletes a lesson and its children (assignments, submissions, files, quiz,
// access, progress) via cascade. Afterwards, stored assets no other
// course/lesson still uses are cleaned up, best-effort.
export async function deleteLesson(id: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { files: true },
  });
  if (!lesson) throw new AppError('Lesson not found', 'השיעור לא נמצא', 404);
  const submitted = await submissionFileUrls({ assignment: { lessonId: id } });

  await prisma.lesson.delete({ where: { id } });
  await releaseFileUrls([...lesson.files.map((f) => f.url), ...submitted]);
}

export async function importMarkdown(lessonId: string, content: string) {
  return prisma.lesson.update({ where: { id: lessonId }, data: { contentMd: content } });
}

export async function getLessonAccess(lessonId: string) {
  const records = await prisma.lessonAccess.findMany({
    where: { lessonId },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  return records.map((r) => r.student);
}

export async function grantLessonAccess(lessonId: string, studentId: string) {
  const exists = await prisma.lessonAccess.findUnique({
    where: { studentId_lessonId: { studentId, lessonId } },
  });
  if (exists) throw new AppError('Access already exists', 'לתלמידה כבר יש גישה לשיעור זה', 409);
  await prisma.lessonAccess.create({ data: { studentId, lessonId } });
}

export async function revokeLessonAccess(lessonId: string, studentId: string) {
  await prisma.lessonAccess.delete({ where: { studentId_lessonId: { studentId, lessonId } } });
}

async function grantLessonAccessBulk(lessonId: string, studentIds: string[]) {
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return { granted: 0 };
  const result = await prisma.lessonAccess.createMany({
    data: unique.map((studentId) => ({ studentId, lessonId })),
    skipDuplicates: true,
  });
  return { granted: result.count };
}

/** Grants exceptional lesson access to every student in a group in one call, instead of one request per student. */
export async function grantLessonAccessByGroup(lessonId: string, groupId: string) {
  const members = await prisma.studentGroup.findMany({ where: { groupId }, select: { studentId: true } });
  return grantLessonAccessBulk(lessonId, members.map((m) => m.studentId));
}

/** Grants exceptional lesson access from a list of emails (e.g. pasted from a file); unknown emails are reported back, not silently dropped. */
export async function grantLessonAccessByEmails(lessonId: string, emails: string[]) {
  const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { email: { in: normalized }, role: 'STUDENT' },
    select: { id: true, email: true },
  });
  const foundEmails = new Set(users.map((u) => u.email));
  const notFound = normalized.filter((e) => !foundEmails.has(e));
  const result = await grantLessonAccessBulk(lessonId, users.map((u) => u.id));
  return { ...result, notFound };
}

