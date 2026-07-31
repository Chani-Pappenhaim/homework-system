import { prisma } from '../config/prisma';
import { uploadBuffer, destroyByUrl, toFileDTO } from '../utils/storage';
import { assertLessonAccess, assertCourseAccess } from '../utils/access';

// Lessons created before multi-link support only have the legacy single
// `githubUrl` column populated; `githubUrls` is the source of truth going
// forward, so fall back to wrapping the legacy value when it's empty.
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
    include: { files: true, assignments: true },
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
  return {
    ...lesson,
    assignments,
    githubUrls: effectiveGithubUrls(lesson),
    completed: Boolean(progress),
    files: lesson.files.map(toFileDTO),
  };
}

// Student self-marks a lesson complete (completed=true) or clears it (false)
export async function setLessonProgress(studentId: string, lessonId: string, completed: boolean) {
  if (completed) {
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

export async function updateLesson(id: string, data: Partial<{
  topic: string; lessonDate: string; contentMd: string;
  githubUrls: string[]; hidden: boolean; order: number;
}>) {
  const { githubUrls, ...rest } = data;
  return prisma.lesson.update({
    where: { id },
    data: {
      ...rest,
      ...(githubUrls !== undefined ? { githubUrls: cleanGithubUrls(githubUrls) } : {}),
    },
  });
}

export async function reorderLessons(lessons: { id: string; order: number }[]) {
  await Promise.all(
    lessons.map((l) => prisma.lesson.update({ where: { id: l.id }, data: { order: l.order } }))
  );
}

export async function uploadLessonFile(lessonId: string, buffer: Buffer, originalName: string, mimeType: string, displayName?: string) {
  const uploaded = await uploadBuffer(buffer, mimeType, 'lessons', originalName);
  const file = await prisma.lessonFile.create({
    data: { lessonId, name: displayName?.trim() || originalName, url: uploaded.url, sizeBytes: uploaded.bytes },
  });
  return toFileDTO(file);
}

export async function deleteLessonFile(lessonId: string, fileId: string) {
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw Object.assign(new Error('File not found'), { status: 404 });
  await destroyByUrl(file.url);
  await prisma.lessonFile.delete({ where: { id: fileId } });
}

// Deletes a lesson and its children (assignments, submissions, files, quiz,
// access, progress) via Prisma cascade. Stored file assets are cleaned up first,
// best-effort, so a storage failure can't block the delete.
export async function deleteLesson(id: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { files: true },
  });
  if (!lesson) throw Object.assign(new Error('Lesson not found'), { status: 404 });

  for (const f of lesson.files) {
    try {
      await destroyByUrl(f.url);
    } catch (err) {
      console.error('[storage] failed to destroy asset:', f.url, err);
    }
  }

  await prisma.lesson.delete({ where: { id } });
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
  if (exists) throw Object.assign(new Error('Access already exists'), { status: 409 });
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

