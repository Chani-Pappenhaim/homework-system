import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';

export async function getCoursesForUser(userId: string, role: string) {
  if (role === 'ADMIN') {
    const courses = await prisma.course.findMany({
      include: { group: { select: { name: true } }, _count: { select: { lessons: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return courses.map(toCourseDTO);
  }

  const student = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentGroups: { select: { groupId: true } } },
  });
  const groupIds = student?.studentGroups.map((sg) => sg.groupId) ?? [];

  const courses = await prisma.course.findMany({
    where: { hidden: false, groupId: { in: groupIds } },
    include: { group: { select: { name: true } }, _count: { select: { lessons: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return courses.map(toCourseDTO);
}

export async function createCourse(data: { name: string; year?: string; description?: string; groupId: string }) {
  const course = await prisma.course.create({
    data,
    include: { group: { select: { name: true } }, _count: { select: { lessons: true } } },
  });
  return toCourseDTO(course);
}

export async function getCourseById(id: string, userId: string, role: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      links: { orderBy: { order: 'asc' } },
      files: { orderBy: { uploadedAt: 'desc' } },
      lessons: { orderBy: { order: 'asc' } },
      group: { select: { name: true } },
      _count: { select: { lessons: true } },
    },
  });
  if (!course) return null;

  if (role !== 'ADMIN') {
    const hasAccess = await checkStudentCourseAccess(userId, id, course.groupId);
    if (!hasAccess) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  const lessons = course.lessons
    .filter((l) => role === 'ADMIN' || !l.hidden)
    .map((l) => ({
      id: l.id, topic: l.topic, lessonDate: l.lessonDate,
      hidden: l.hidden, order: l.order,
    }));

  return {
    id: course.id, name: course.name, year: course.year,
    description: course.description, imageUrl: course.imageUrl,
    hidden: course.hidden, groupId: course.groupId,
    links: course.links,
    files: course.files.map((f) => ({ ...f, sizeBytes: f.sizeBytes?.toString() })),
    lessons,
  };
}

export async function updateCourse(id: string, data: Partial<{ name: string; year: string; description: string; imageUrl: string; hidden: boolean; groupId: string }>) {
  const course = await prisma.course.update({
    where: { id }, data,
    include: { group: { select: { name: true } }, _count: { select: { lessons: true } } },
  });
  return toCourseDTO(course);
}

export async function copyCourse(courseId: string, targetGroupId: string) {
  const source = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      links: true, files: true,
      lessons: { include: { files: true, assignments: true } },
    },
  });
  if (!source) throw Object.assign(new Error('Course not found'), { status: 404 });

  const newCourse = await prisma.course.create({
    data: {
      name: source.name, year: source.year, description: source.description,
      imageUrl: source.imageUrl, hidden: false, groupId: targetGroupId,
      links: { create: source.links.map(({ id: _, courseId: __, ...l }) => l) },
      files: { create: source.files.map(({ id: _, courseId: __, uploadedAt: _a, ...f }) => f) },
      lessons: {
        create: source.lessons.map(({ id: _, courseId: __, createdAt: _c, ...lesson }: any) => ({
          ...lesson, hidden: false,
          files: { create: (lesson as any).files?.map(({ id: _i, lessonId: _l, uploadedAt: _a, ...f }: any) => f) ?? [] },
          assignments: {
            create: (lesson as any).assignments?.map(({ id: _i, lessonId: _l, createdAt: _c, ...a }: any) => a) ?? [],
          },
        })),
      },
    },
    include: { group: { select: { name: true } }, _count: { select: { lessons: true } } },
  });
  return toCourseDTO(newCourse);
}


export async function addCourseLink(courseId: string, label: string, url: string, order = 0) {
  return prisma.courseLink.create({ data: { courseId, label, url, order } });
}

export async function deleteCourseLink(courseId: string, linkId: string) {
  await prisma.courseLink.delete({ where: { id: linkId, courseId } });
}

export async function uploadCourseFile(courseId: string, buffer: Buffer, originalName: string, mimeType: string) {
  const result = await cloudinary.uploader.upload(
    `data:${mimeType};base64,${buffer.toString('base64')}`,
    { resource_type: 'auto', folder: 'courses' }
  );
  return prisma.courseFile.create({
    data: { courseId, name: originalName, url: result.secure_url, sizeBytes: result.bytes },
  });
}

export async function deleteCourseFile(courseId: string, fileId: string) {
  const file = await prisma.courseFile.findUnique({ where: { id: fileId, courseId } });
  if (!file) throw Object.assign(new Error('File not found'), { status: 404 });
  const publicId = extractPublicId(file.url);
  if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  await prisma.courseFile.delete({ where: { id: fileId } });
}

export async function checkStudentCourseAccess(studentId: string, courseId: string, groupId: string) {
  const inGroup = await prisma.studentGroup.findFirst({ where: { studentId, groupId } });
  return !!inGroup;
}

export async function checkStudentLessonAccess(studentId: string, lessonId: string, courseGroupId: string) {
  const inGroup = await prisma.studentGroup.findFirst({ where: { studentId, groupId: courseGroupId } });
  if (inGroup) return true;
  const hasAccess = await prisma.lessonAccess.findUnique({
    where: { studentId_lessonId: { studentId, lessonId } },
  });
  return !!hasAccess;
}

function toCourseDTO(course: any) {
  return {
    id: course.id, name: course.name, year: course.year,
    description: course.description, imageUrl: course.imageUrl,
    hidden: course.hidden, groupId: course.groupId,
    groupName: course.group?.name, lessonCount: course._count?.lessons ?? 0,
    createdAt: course.createdAt,
  };
}

function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
  return match ? match[1] : null;
}
