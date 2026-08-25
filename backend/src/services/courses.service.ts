import { prisma } from '../config/prisma';
import { uploadBuffer, destroyByUrl, toFileDTO } from '../utils/storage';
import { assertCourseAccess } from '../utils/access';

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
    include: {
      group: { select: { name: true } },
      _count: { select: { lessons: { where: { hidden: false } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count this student's completed (visible) lessons per course, for the progress meter
  const courseIds = courses.map((c) => c.id);
  const progress = await prisma.lessonProgress.findMany({
    where: { studentId: userId, lesson: { hidden: false, courseId: { in: courseIds } } },
    select: { lesson: { select: { courseId: true } } },
  });
  const completedByCourse: Record<string, number> = {};
  for (const p of progress) {
    completedByCourse[p.lesson.courseId] = (completedByCourse[p.lesson.courseId] ?? 0) + 1;
  }

  return courses.map((c) => ({ ...toCourseDTO(c), completedLessons: completedByCourse[c.id] ?? 0 }));
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

  await assertCourseAccess(userId, role, id);

  const visibleLessons = course.lessons.filter((l) => role === 'ADMIN' || !l.hidden);

  // Which of these lessons has the current student marked complete?
  const completedIds = new Set(
    role === 'ADMIN'
      ? []
      : (await prisma.lessonProgress.findMany({
          where: { studentId: userId, lessonId: { in: visibleLessons.map((l) => l.id) } },
          select: { lessonId: true },
        })).map((p) => p.lessonId)
  );

  // Teacher view: how many students in the course's group finished each lesson.
  let completedCountByLesson: Record<string, number> = {};
  let groupStudentCount = 0;
  if (role === 'ADMIN') {
    groupStudentCount = await prisma.studentGroup.count({ where: { groupId: course.groupId } });
    const counts = await prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      where: { lessonId: { in: visibleLessons.map((l) => l.id) } },
      _count: { lessonId: true },
    });
    completedCountByLesson = Object.fromEntries(counts.map((c) => [c.lessonId, c._count.lessonId]));
  }

  const lessons = visibleLessons.map((l) => ({
    id: l.id, topic: l.topic, lessonDate: l.lessonDate,
    hidden: l.hidden, order: l.order,
    completed: completedIds.has(l.id),
    ...(role === 'ADMIN' ? { completedCount: completedCountByLesson[l.id] ?? 0, groupStudentCount } : {}),
  }));

  return {
    id: course.id, name: course.name, year: course.year,
    description: course.description, imageUrl: course.imageUrl,
    hidden: course.hidden, groupId: course.groupId,
    links: course.links,
    files: course.files.map(toFileDTO),
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

export async function uploadCourseFile(courseId: string, buffer: Buffer, originalName: string, mimeType: string, displayName?: string) {
  const uploaded = await uploadBuffer(buffer, mimeType, 'courses', originalName);
  const file = await prisma.courseFile.create({
    data: { courseId, name: displayName?.trim() || originalName, url: uploaded.url, sizeBytes: uploaded.bytes },
  });
  return toFileDTO(file);
}

export async function deleteCourseFile(courseId: string, fileId: string) {
  const file = await prisma.courseFile.findUnique({ where: { id: fileId, courseId } });
  if (!file) throw Object.assign(new Error('File not found'), { status: 404 });
  await destroyByUrl(file.url);
  await prisma.courseFile.delete({ where: { id: fileId } });
}

// Deletes a course and everything under it. Prisma cascades the DB rows (lessons,
// links, files, assignments, submissions...), so we only need to clean up the
// stored (Cloudinary) assets first, best-effort — a storage hiccup must not block
// the delete.
export async function deleteCourse(id: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: { files: true, lessons: { include: { files: true } } },
  });
  if (!course) throw Object.assign(new Error('Course not found'), { status: 404 });

  const urls = [
    ...course.files.map((f) => f.url),
    ...course.lessons.flatMap((l) => l.files.map((f) => f.url)),
  ];
  await destroyUrls(urls);

  await prisma.course.delete({ where: { id } });
}

/** Best-effort removal of stored assets; never throws. */
export async function destroyUrls(urls: string[]) {
  for (const url of urls) {
    try {
      await destroyByUrl(url);
    } catch (err) {
      console.error('[storage] failed to destroy asset:', url, err);
    }
  }
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

