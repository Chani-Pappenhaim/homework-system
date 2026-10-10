import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { uploadBuffer, createUploadSignature, toFileDTO, destroyByUrl, isOwnUpload } from '../utils/storage';
import { confirmUpload, discardPendingUpload } from '../utils/pending-uploads';
import { releaseFileUrls, submissionFileUrls } from '../utils/file-refs';
import { assertCourseAccess } from '../utils/access';
import { groupDisplayName, groupNameSelect } from '../utils/group-name';

export async function getCoursesForUser(userId: string, role: string) {
  if (role === 'ADMIN') {
    const courses = await prisma.course.findMany({
      include: { group: { select: groupNameSelect }, _count: { select: { lessons: true } } },
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
    where: {
      hidden: false,
      OR: [{ groupId: { in: groupIds } }, { access: { some: { studentId: userId } } }],
    },
    include: {
      group: { select: groupNameSelect },
      _count: { select: { lessons: { where: { hidden: false } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count this student's completed lessons per course, for the progress meter
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
    include: { group: { select: groupNameSelect }, _count: { select: { lessons: true } } },
  });
  return toCourseDTO(course);
}

export async function getCourseById(id: string, userId: string, role: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      links: { orderBy: { order: 'asc' } },
      files: { where: role === 'ADMIN' ? {} : { hidden: false }, orderBy: { uploadedAt: 'desc' } },
      lessons: { orderBy: { order: 'asc' } },
      group: { select: groupNameSelect },
      _count: { select: { lessons: true } },
    },
  });
  if (!course) return null;

  await assertCourseAccess(userId, role, id);

  const visibleLessons = course.lessons.filter((l) => role === 'ADMIN' || !l.hidden);

  // Lessons the current student has marked complete
  const completedIds = new Set(
    role === 'ADMIN'
      ? []
      : (await prisma.lessonProgress.findMany({
          where: { studentId: userId, lessonId: { in: visibleLessons.map((l) => l.id) } },
          select: { lessonId: true },
        })).map((p) => p.lessonId)
  );

  // Teacher view: how many students in the course's group finished each lesson
  let completedCountByLesson: Record<string, number> = {};
  let groupStudentCount = 0;
  if (role === 'ADMIN') {
    groupStudentCount = await prisma.studentGroup.count({ where: { groupId: course.groupId } });
    const counts = await prisma.lessonProgress.groupBy({
      by: ['lessonId'],
      // Count only the group's own students, the same set the denominator
      // counts — a student with a personal grant or who left the group would
      // otherwise push the ratio past 100%.
      where: {
        lessonId: { in: visibleLessons.map((l) => l.id) },
        student: { studentGroups: { some: { groupId: course.groupId } } },
      },
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
    groupName: groupDisplayName(course.group),
    links: course.links,
    files: course.files.map((f) => toFileDTO(f, 'course', userId)),
    lessons,
  };
}

export async function updateCourse(id: string, data: Partial<{ name: string; year: string; description: string; imageUrl: string; hidden: boolean; groupId: string }>) {
  const course = await prisma.course.update({
    where: { id }, data,
    include: { group: { select: groupNameSelect }, _count: { select: { lessons: true } } },
  });
  return toCourseDTO(course);
}

export async function copyCourse(courseId: string, targetGroupId: string) {
  const source = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      links: true, files: true,
      lessons: { include: { files: true, assignments: true, quiz: true } },
    },
  });
  if (!source) throw new AppError('Course not found', 'הקורס לא נמצא', 404);

  const newCourse = await prisma.course.create({
    data: {
      name: source.name, year: source.year, description: source.description,
      imageUrl: source.imageUrl, hidden: false, groupId: targetGroupId,
      links: { create: source.links.map(({ id: _, courseId: __, ...l }) => l) },
      files: { create: source.files.map(({ id: _, courseId: __, uploadedAt: _a, ...f }) => f) },
      lessons: {
        // Each lesson keeps its own hidden flag (a lesson the teacher held back
        // stays held back), and its quiz comes along as an unpublished draft,
        // the same way copying a single lesson treats it.
        create: source.lessons.map(({ id: _, courseId: __, createdAt: _c, files, assignments, quiz, ...lesson }: any) => ({
          ...lesson,
          files: { create: files?.map(({ id: _i, lessonId: _l, uploadedAt: _a, ...f }: any) => f) ?? [] },
          assignments: {
            create: assignments?.map(({ id: _i, lessonId: _l, createdAt: _c, ...a }: any) => a) ?? [],
          },
          ...(quiz ? { quiz: { create: { questions: quiz.questions ?? [], published: false } } } : {}),
        })),
      },
    },
    include: { group: { select: groupNameSelect }, _count: { select: { lessons: true } } },
  });
  return toCourseDTO(newCourse);
}


// Links are rendered as plain <a href>, so anything but http(s) — a
// `javascript:` URL above all — must never get stored.
function webUrl(raw: unknown): string {
  const typed = typeof raw === 'string' ? raw.trim() : '';
  // "www.site.com" is how teachers usually paste a link; give it the scheme
  // the page would add anyway. Anything that names its own scheme is checked.
  const value = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed.replace(/^\/+/, '')}`;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value;
  } catch { /* falls through to the error */ }
  throw new AppError('Invalid link URL', 'הקישור חייב להיות כתובת אינטרנט תקינה (http או https)', 400);
}

export async function addCourseLink(courseId: string, label: string, url: string, order = 0) {
  const name = typeof label === 'string' ? label.trim() : '';
  if (!name) throw new AppError('Label is required', 'יש להזין שם לקישור', 400);
  return prisma.courseLink.create({
    data: { courseId, label: name, url: webUrl(url), order: Number.isInteger(order) ? order : 0 },
  });
}

export async function deleteCourseLink(courseId: string, linkId: string) {
  await prisma.courseLink.delete({ where: { id: linkId, courseId } });
}

// Signed params for a direct browser-to-Cloudinary upload.
/** Tagged for the pending-upload cleanup only when the page asks (`tagged`). */
export function getCourseUploadSignature(userId: string, tagged = false) {
  return createUploadSignature('courses', { uploaderId: tagged ? userId : undefined });
}

export async function uploadCourseFile(
  courseId: string,
  file: { buffer: Buffer; mimeType: string; originalName: string } | { url: string; bytes: number; originalName: string },
  displayName: string | undefined,
  userId: string
) {
  const direct = !('buffer' in file);
  if (direct && !isOwnUpload(file.url, 'courses')) {
    throw new AppError('Uploaded file URL is not ours', 'כתובת הקובץ שהועלה אינה תקינה', 400);
  }
  const { url, bytes } = 'buffer' in file
    ? await uploadBuffer(file.buffer, file.mimeType, 'courses', file.originalName)
    : file;
  try {
    const created = await prisma.courseFile.create({
      data: { courseId, name: displayName?.trim() || file.originalName, url, sizeBytes: bytes },
    });
    if (direct) await confirmUpload(url);
    return toFileDTO(created, 'course', userId);
  } catch (err) {
    // Not saved, so nothing will ever point at the stored file.
    if (direct) await discardPendingUpload(url, userId);
    else await destroyByUrl(url).catch((e) => console.error('[storage] cleanup failed:', url, e));
    throw err;
  }
}

export async function setCourseFileHidden(courseId: string, fileId: string, hidden: boolean, userId: string) {
  const file = await prisma.courseFile.findUnique({ where: { id: fileId, courseId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  const updated = await prisma.courseFile.update({ where: { id: fileId }, data: { hidden } });
  return toFileDTO(updated, 'course', userId);
}

export async function getCourseAccess(courseId: string) {
  const records = await prisma.courseAccess.findMany({
    where: { courseId },
    include: { student: { select: { id: true, name: true, email: true } } },
  });
  return records.map((r) => r.student);
}

export async function grantCourseAccess(courseId: string, studentId: string) {
  const student = await prisma.user.findFirst({ where: { id: studentId, role: 'STUDENT' }, select: { id: true } });
  if (!student) throw new AppError('Student not found', 'התלמידה לא נמצאה', 404);
  const exists = await prisma.courseAccess.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  if (exists) throw new AppError('Access already exists', 'לתלמידה כבר יש גישה לקורס זה', 409);
  await prisma.courseAccess.create({ data: { studentId, courseId } });
}

export async function revokeCourseAccess(courseId: string, studentId: string) {
  await prisma.courseAccess.deleteMany({ where: { studentId, courseId } });
}

export async function deleteCourseFile(courseId: string, fileId: string) {
  const file = await prisma.courseFile.findUnique({ where: { id: fileId, courseId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  await prisma.courseFile.delete({ where: { id: fileId } });
  await releaseFileUrls([file.url]);
}

export async function renameCourseFile(courseId: string, fileId: string, name: string, userId: string) {
  const file = await prisma.courseFile.findUnique({ where: { id: fileId, courseId } });
  if (!file) throw new AppError('File not found', 'הקובץ לא נמצא', 404);
  const trimmed = name.trim();
  if (!trimmed) throw new AppError('Name is required', 'יש להזין שם', 400);
  const updated = await prisma.courseFile.update({ where: { id: fileId }, data: { name: trimmed } });
  return toFileDTO(updated, 'course', userId);
}

// Deletes a course and everything under it. The DB rows cascade automatically;
// afterwards, stored assets that no other course/lesson still uses (e.g. one
// sharing them through a copy) are cleaned up, best-effort.
export async function deleteCourse(id: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: { files: true, lessons: { include: { files: true } } },
  });
  if (!course) throw new AppError('Course not found', 'הקורס לא נמצא', 404);

  const urls = [
    ...course.files.map((f) => f.url),
    ...course.lessons.flatMap((l) => l.files.map((f) => f.url)),
    ...(await submissionFileUrls({ assignment: { lesson: { courseId: id } } })),
  ];

  await prisma.course.delete({ where: { id } });
  await releaseFileUrls(urls);
}


function toCourseDTO(course: any) {
  return {
    id: course.id, name: course.name, year: course.year,
    description: course.description, imageUrl: course.imageUrl,
    hidden: course.hidden, groupId: course.groupId,
    groupName: course.group ? groupDisplayName(course.group) : undefined, lessonCount: course._count?.lessons ?? 0,
    createdAt: course.createdAt,
  };
}

