import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';

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
  return prisma.lesson.create({ data: { courseId, ...data } });
}

export async function getLessonById(id: string, role: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: {
      files: true,
      assignments: true,
    },
  });
  if (!lesson) return null;
  if (role !== 'ADMIN' && lesson.hidden) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return {
    ...lesson,
    files: lesson.files.map((f) => ({ ...f, sizeBytes: f.sizeBytes?.toString() })),
  };
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

function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
}
