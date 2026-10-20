import type { AttendanceStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { MAX_NOTE, MAX_TITLE, parseDay } from './attendance-common';
import { loadRoster, requireCourse, type RosterStudent } from './roster.service';

// Kept importable from here for the controller and existing callers.
export { loadRoster, type RosterStudent };
export { getMyAttendance } from './student-attendance.service';
export { parseDay } from './attendance-common';
export * from './attendance-excel.service';

const STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'PARTIAL'];
function requireDay(value: unknown): Date {
  const day = parseDay(value);
  if (!day) throw new AppError('Invalid date', 'התאריך אינו תקין', 400);
  return day;
}

function cleanTitle(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new AppError('Invalid title', 'הכותרת אינה תקינה', 400);
  const t = value.trim().slice(0, MAX_TITLE);
  return t || null;
}

// ---------- teacher: overview ----------

export async function getCourseAttendance(courseId: string) {
  const course = await requireCourse(courseId);
  const [roster, lessons, sessions] = await Promise.all([
    loadRoster(courseId, course.groupId),
    prisma.lesson.findMany({
      where: { courseId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, topic: true, lessonDate: true, hidden: true,
        assignments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, deadline: true, submissions: { select: { studentId: true } } },
        },
      },
    }),
    prisma.attendanceSession.findMany({
      where: { courseId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true, date: true, title: true, lessonId: true,
        records: { select: { studentId: true, status: true, note: true } },
        homework: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, marks: { where: { done: true }, select: { studentId: true } } },
        },
      },
    }),
  ]);

  return {
    course: { id: course.id, name: course.name },
    roster,
    lessons: lessons.map((l) => ({
      id: l.id, topic: l.topic, lessonDate: l.lessonDate, hidden: l.hidden,
      assignments: l.assignments.map((a) => ({
        id: a.id, title: a.title, deadline: a.deadline,
        submittedBy: a.submissions.map((s) => s.studentId),
      })),
    })),
    sessions: sessions.map((s) => ({
      id: s.id, date: s.date, title: s.title, lessonId: s.lessonId,
      records: s.records,
      homework: s.homework.map((h) => ({ id: h.id, title: h.title, doneBy: h.marks.map((m) => m.studentId) })),
    })),
  };
}

// ---------- teacher: sessions ----------

async function assertLessonInCourse(lessonId: string, courseId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { courseId: true } });
  if (!lesson || lesson.courseId !== courseId) throw new AppError('Lesson not in course', 'השיעור לא שייך לקורס הזה', 400);
}

async function requireSession(sessionId: string) {
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, select: { id: true, courseId: true } });
  if (!session) throw new AppError('Session not found', 'המפגש לא נמצא. ייתכן שנמחק - יש לרענן את הדף.', 404);
  return session;
}

export async function createSession(courseId: string, input: { date?: unknown; lessonId?: unknown; title?: unknown }) {
  await requireCourse(courseId);
  const lessonId = typeof input.lessonId === 'string' && input.lessonId ? input.lessonId : null;
  if (lessonId) await assertLessonInCourse(lessonId, courseId);
  return prisma.attendanceSession.create({
    data: { courseId, lessonId, date: requireDay(input.date), title: cleanTitle(input.title) },
    select: { id: true, date: true, title: true, lessonId: true },
  });
}

/** Opens a meeting for every dated lesson that has none yet. */
export async function createSessionsFromLessons(courseId: string) {
  await requireCourse(courseId);
  const lessons = await prisma.lesson.findMany({
    where: { courseId, attendanceSessions: { none: {} } },
    select: { id: true, lessonDate: true },
  });
  const dated = lessons.filter((l) => l.lessonDate);
  if (dated.length) {
    await prisma.attendanceSession.createMany({
      data: dated.map((l) => ({ courseId, lessonId: l.id, date: parseDay(l.lessonDate)! })),
    });
  }
  return { created: dated.length, undated: lessons.length - dated.length };
}

export async function updateSession(sessionId: string, input: { date?: unknown; lessonId?: unknown; title?: unknown }) {
  const session = await requireSession(sessionId);
  const data: { date?: Date; lessonId?: string | null; title?: string | null } = {};
  if (input.date !== undefined) data.date = requireDay(input.date);
  if (input.title !== undefined) data.title = cleanTitle(input.title);
  if (input.lessonId !== undefined) {
    const lessonId = typeof input.lessonId === 'string' && input.lessonId ? input.lessonId : null;
    if (lessonId) await assertLessonInCourse(lessonId, session.courseId);
    data.lessonId = lessonId;
  }
  return prisma.attendanceSession.update({
    where: { id: sessionId }, data, select: { id: true, date: true, title: true, lessonId: true },
  });
}

export async function deleteSession(sessionId: string) {
  await requireSession(sessionId);
  await prisma.attendanceSession.delete({ where: { id: sessionId } });
}

// ---------- teacher: marking ----------

async function rosterIdsForCourse(courseId: string) {
  const course = await requireCourse(courseId);
  return new Set((await loadRoster(courseId, course.groupId)).map((s) => s.id));
}

function readEntries(entries: unknown): unknown[] {
  if (!Array.isArray(entries) || entries.length > 2000) {
    throw new AppError('Invalid entries', 'רשימת הסימונים אינה תקינה', 400);
  }
  return entries;
}

/** Sets status and note for several students at once; a null status clears the mark. */
export async function saveRecords(sessionId: string, entries: unknown) {
  const session = await requireSession(sessionId);
  const list = readEntries(entries);
  const roster = await rosterIdsForCourse(session.courseId);

  const ops = list.map((raw) => {
    const e = (raw ?? {}) as { studentId?: unknown; status?: unknown; note?: unknown };
    if (typeof e.studentId !== 'string' || !roster.has(e.studentId)) {
      throw new AppError('Student not on roster', 'אחת התלמידות לא רשומה לקורס הזה', 400);
    }
    const studentId = e.studentId;
    if (e.status === null) {
      return prisma.attendanceRecord.deleteMany({ where: { sessionId, studentId } });
    }
    if (!STATUSES.includes(e.status as AttendanceStatus)) {
      throw new AppError('Invalid status', 'סטטוס הנוכחות אינו תקין', 400);
    }
    if (e.note !== undefined && e.note !== null && typeof e.note !== 'string') {
      throw new AppError('Invalid note', 'ההערה אינה תקינה', 400);
    }
    const status = e.status as AttendanceStatus;
    // A missing note leaves the stored one alone; an empty one clears it.
    const note = e.note === undefined ? undefined : (e.note ?? '').trim().slice(0, MAX_NOTE) || null;
    return prisma.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId, studentId } },
      create: { sessionId, studentId, status, note: note ?? null },
      update: note === undefined ? { status } : { status, note },
    });
  });
  await prisma.$transaction(ops);
  return { saved: ops.length };
}

// ---------- teacher: extra homework ----------

async function requireHomework(homeworkId: string) {
  const hw = await prisma.extraHomework.findUnique({
    where: { id: homeworkId }, select: { id: true, session: { select: { courseId: true } } },
  });
  if (!hw) throw new AppError('Homework not found', 'שיעורי הבית לא נמצאו. ייתכן שנמחקו - יש לרענן את הדף.', 404);
  return hw;
}

function requireTitle(value: unknown): string {
  const title = cleanTitle(value);
  if (!title) throw new AppError('Missing title', 'יש לכתוב מה היו שיעורי הבית', 400);
  return title;
}

export async function addHomework(sessionId: string, title: unknown) {
  await requireSession(sessionId);
  return prisma.extraHomework.create({ data: { sessionId, title: requireTitle(title) }, select: { id: true, title: true } });
}

export async function renameHomework(homeworkId: string, title: unknown) {
  await requireHomework(homeworkId);
  return prisma.extraHomework.update({ where: { id: homeworkId }, data: { title: requireTitle(title) }, select: { id: true, title: true } });
}

export async function deleteHomework(homeworkId: string) {
  await requireHomework(homeworkId);
  await prisma.extraHomework.delete({ where: { id: homeworkId } });
}

export async function saveHomeworkMarks(homeworkId: string, entries: unknown) {
  const hw = await requireHomework(homeworkId);
  const list = readEntries(entries);
  const roster = await rosterIdsForCourse(hw.session.courseId);
  const ops = list.map((raw) => {
    const e = (raw ?? {}) as { studentId?: unknown; done?: unknown };
    if (typeof e.studentId !== 'string' || !roster.has(e.studentId) || typeof e.done !== 'boolean') {
      throw new AppError('Invalid mark', 'אחד הסימונים אינו תקין', 400);
    }
    const studentId = e.studentId;
    return e.done
      ? prisma.homeworkMark.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId } },
        create: { homeworkId, studentId, done: true },
        update: { done: true },
      })
      : prisma.homeworkMark.deleteMany({ where: { homeworkId, studentId } });
  });
  await prisma.$transaction(ops);
  return { saved: ops.length };
}

// ---------- teacher: exclusions ----------

export async function setExclusion(courseId: string, studentId: string, excluded: boolean) {
  const course = await requireCourse(courseId);
  const student = (await loadRoster(courseId, course.groupId)).find((s) => s.id === studentId);
  if (!student) throw new AppError('Student not on roster', 'התלמידה לא רשומה לקורס הזה', 404);
  if (student.source !== 'access') {
    throw new AppError('Group member', 'אפשר להוציא מהנוכחות רק תלמידה שקיבלה גישה אישית לקורס, לא חברה בקבוצה', 400);
  }
  if (excluded) {
    await prisma.attendanceExclusion.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      create: { courseId, studentId },
      update: {},
    });
  } else {
    await prisma.attendanceExclusion.deleteMany({ where: { courseId, studentId } });
  }
  return { excluded };
}
