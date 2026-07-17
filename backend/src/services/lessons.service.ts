import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';
import { checkStudentLessonAccess } from './courses.service';

export async function getLessons(courseId: string, role: string) {
  const lessons = await prisma.lesson.findMany({
    where: { courseId, ...(role !== 'ADMIN' && { hidden: false }) },
    include: { _count: { select: { assignments: true } } },
    orderBy: { order: 'asc' },
  });
  return lessons.map((l) => ({
    id: l.id, topic: l.topic, lessonDate: l.lessonDate,
    hidden: l.hidden, order: l.order, githubUrl: l.githubUrl,
    assignmentCount: l._count.assignments,
  }));
}

export async function createLesson(courseId: string, data: {
  topic: string; lessonDate?: string; contentMd?: string;
  githubUrl?: string; hidden?: boolean; order?: number;
}) {
  const { lessonDate, ...rest } = data;
  return prisma.lesson.create({
    data: {
      courseId,
      ...rest,
      ...(lessonDate ? { lessonDate: new Date(lessonDate) } : {}),
    },
  });
}

export async function getLessonById(id: string, userId: string, role: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      files: true,
      assignments: true,
      course: { select: { groupId: true, hidden: true } },
    },
  });
  if (!lesson) return null;

  if (role !== 'ADMIN') {
    if (lesson.hidden || lesson.course.hidden) throw Object.assign(new Error('Forbidden'), { status: 403 });
    // A student may only open a lesson from her own group's course, or one she was granted access to
    const hasAccess = await checkStudentLessonAccess(userId, id, lesson.course.groupId);
    if (!hasAccess) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  const progress = await prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: userId, lessonId: id } },
  });
  const { course: _course, ...rest } = lesson;
  return {
    ...rest,
    completed: Boolean(progress),
    files: lesson.files.map((f) => ({ ...f, sizeBytes: f.sizeBytes?.toString() })),
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
  githubUrl: string; hidden: boolean; order: number;
}>) {
  return prisma.lesson.update({ where: { id }, data });
}

export async function reorderLessons(lessons: { id: string; order: number }[]) {
  await Promise.all(
    lessons.map((l) => prisma.lesson.update({ where: { id: l.id }, data: { order: l.order } }))
  );
}

export async function uploadLessonFile(lessonId: string, buffer: Buffer, originalName: string, mimeType: string) {
  const result = await cloudinary.uploader.upload(
    `data:${mimeType};base64,${buffer.toString('base64')}`,
    { resource_type: 'auto', folder: 'lessons' }
  );
  return prisma.lessonFile.create({
    data: { lessonId, name: originalName, url: result.secure_url, sizeBytes: result.bytes },
  });
}

export async function deleteLessonFile(lessonId: string, fileId: string) {
  const file = await prisma.lessonFile.findUnique({ where: { id: fileId, lessonId } });
  if (!file) throw Object.assign(new Error('File not found'), { status: 404 });
  const publicId = extractPublicId(file.url);
  if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  await prisma.lessonFile.delete({ where: { id: fileId } });
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

function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
}
