import { prisma } from '../config/prisma';
import { AppError } from './errors';

function forbidden() {
  return new AppError('Forbidden', 'אין לך הרשאה לגשת לתוכן זה', 403);
}

/**
 * The single home for "may this user read this lesson?".
 *
 * Every entry point that returns lesson-scoped content (the lesson itself, its
 * assignments, its quiz) must call this, so access rules stay consistent
 * across all of them instead of being reimplemented per service.
 */
export async function assertLessonAccess(userId: string, role: string, lessonId: string) {
  if (role === 'ADMIN') return;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { hidden: true, course: { select: { id: true, groupId: true, hidden: true } } },
  });
  if (!lesson) throw new AppError('Lesson not found', 'השיעור לא נמצא', 404);
  if (lesson.hidden || lesson.course.hidden) throw forbidden();

  const inGroup = await prisma.studentGroup.findFirst({
    where: { studentId: userId, groupId: lesson.course.groupId },
  });
  if (inGroup) return;
  if (await hasCourseGrant(userId, lesson.course.id)) return;

  const granted = await prisma.lessonAccess.findUnique({
    where: { studentId_lessonId: { studentId: userId, lessonId } },
  });
  if (!granted) throw forbidden();
}

/** The single home for "may this user read this course?". */
export async function assertCourseAccess(userId: string, role: string, courseId: string) {
  if (role === 'ADMIN') return;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { groupId: true, hidden: true },
  });
  if (!course) throw new AppError('Course not found', 'הקורס לא נמצא', 404);
  if (course.hidden) throw forbidden();

  const inGroup = await prisma.studentGroup.findFirst({
    where: { studentId: userId, groupId: course.groupId },
  });
  if (!inGroup && !(await hasCourseGrant(userId, courseId))) throw forbidden();
}

/** Has the teacher let this student into the course outside its group? */
async function hasCourseGrant(studentId: string, courseId: string): Promise<boolean> {
  const grant = await prisma.courseAccess.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
  });
  return Boolean(grant);
}
