import ExcelJS, { type Cell } from 'exceljs';
import type { AttendanceStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { cellText, isValidEmail } from '../utils/excel';

const STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'EXCUSED'];
const MAX_NOTE = 500;
const MAX_TITLE = 200;
const MAX_ROWS = 5000;

export type RosterStudent = {
  id: string;
  name: string;
  email: string;
  // 'group' — a member of the course's group; 'access' — let in personally.
  source: 'group' | 'access';
  // Only an 'access' student can be left off the attendance.
  excluded: boolean;
};

// ---------- dates ----------

/** A calendar day as UTC midnight — the same shape the lesson form stores. */
function utcDay(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/**
 * Reads a day from a request body or a spreadsheet cell: a Date, an Excel
 * serial number, "YYYY-MM-DD", or the Israeli "D/M/YYYY" (also with . or -).
 */
export function parseDay(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return utcDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000;
    return parseDay(new Date(ms));
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return utcDay(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) return utcDay(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

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

// ---------- roster ----------

async function requireCourse(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, groupId: true } });
  if (!course) throw new AppError('Course not found', 'הקורס לא נמצא', 404);
  return course;
}

/** Everyone attendance is taken for in a course, sorted by name. */
export async function loadRoster(courseId: string, groupId: string): Promise<RosterStudent[]> {
  const [members, grants, exclusions] = await Promise.all([
    prisma.studentGroup.findMany({
      where: { groupId, student: { role: 'STUDENT' } },
      select: { student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.courseAccess.findMany({
      where: { courseId, student: { role: 'STUDENT' } },
      select: { student: { select: { id: true, name: true, email: true } } },
    }),
    prisma.attendanceExclusion.findMany({ where: { courseId }, select: { studentId: true } }),
  ]);
  const excluded = new Set(exclusions.map((e) => e.studentId));
  const roster = new Map<string, RosterStudent>();
  for (const { student } of members) roster.set(student.id, { ...student, source: 'group', excluded: false });
  for (const { student } of grants) {
    if (!roster.has(student.id)) roster.set(student.id, { ...student, source: 'access', excluded: excluded.has(student.id) });
  }
  return [...roster.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
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
  if (!session) throw new AppError('Session not found', 'המפגש לא נמצא. ייתכן שנמחק — יש לרענן את הדף.', 404);
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
  if (!hw) throw new AppError('Homework not found', 'שיעורי הבית לא נמצאו. ייתכן שנמחקו — יש לרענן את הדף.', 404);
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

// ---------- excel ----------

const COLUMNS = [
  { key: 'name', header: 'שם (רשות)', match: /^שם/, required: false, hint: 'רק לנוחות הקריאה — המערכת מזהה את התלמידה לפי המייל.' },
  { key: 'email', header: 'מייל תלמידה (חובה)', match: /מייל|אימייל|email/i, required: true, hint: 'המייל שאיתו התלמידה רשומה לאתר.' },
  { key: 'date', header: 'תאריך (חובה)', match: /תאריך|date/i, required: true, hint: 'תאריך המפגש, למשל 15/10/2026.' },
  { key: 'status', header: 'סטטוס (חובה)', match: /סטטוס|status/i, required: true, hint: 'אחד מ: נוכחת / חסרה / מאושרת (חיסור מאושר).' },
  { key: 'note', header: 'הערה (רשות)', match: /הערה|note/i, required: false, hint: 'הערה פנימית למורה — התלמידה לא רואה אותה.' },
  { key: 'topic', header: 'נושא המפגש (רשות)', match: /נושא|topic/i, required: false, hint: 'צריך רק אם היו כמה מפגשים באותו תאריך, או כדי לתת שם למפגש חדש.' },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

const STATUS_WORDS: Record<string, AttendanceStatus> = {
  'נוכחת': 'PRESENT', 'נוכח': 'PRESENT', 'נכחה': 'PRESENT', 'כן': 'PRESENT', 'v': 'PRESENT', '✓': 'PRESENT', '1': 'PRESENT', 'present': 'PRESENT',
  'חסרה': 'ABSENT', 'חסר': 'ABSENT', 'לא': 'ABSENT', 'x': 'ABSENT', '0': 'ABSENT', 'absent': 'ABSENT',
  'מאושרת': 'EXCUSED', 'מאושר': 'EXCUSED', 'חיסור מאושר': 'EXCUSED', 'מוצדק': 'EXCUSED', 'excused': 'EXCUSED',
};

export function parseStatus(raw: string): AttendanceStatus | null {
  return STATUS_WORDS[raw.trim().toLowerCase().replace(/["'״׳]/g, '')] ?? null;
}

/** A sheet ready to fill: this course's students listed, statuses as a dropdown, instructions alongside. */
export async function buildAttendanceTemplate(courseId: string): Promise<Buffer> {
  const course = await requireCourse(courseId);
  const roster = (await loadRoster(courseId, course.groupId)).filter((s) => !s.excluded);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('נוכחות', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === 'note' || c.key === 'topic' ? 30 : 24 }));
  COLUMNS.forEach((c, i) => {
    const cell = sheet.getRow(1).getCell(i + 1);
    cell.font = { bold: true, color: { argb: c.required ? 'FFFFFFFF' : 'FF374151' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FF4F46E5' : 'FFE5E7EB' } };
    cell.note = c.hint;
  });

  const rows = roster.length ? roster.map((s) => ({ name: s.name, email: s.email })) : [{ name: 'ישראלה ישראלי', email: 'student@example.com' }];
  for (const r of rows) sheet.addRow(r);
  const last = Math.max(rows.length + 1, 200);
  sheet.getColumn('date').numFmt = 'dd/mm/yyyy';
  for (let r = 2; r <= last; r++) {
    sheet.getCell(r, 4).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"נוכחת,חסרה,מאושרת"'],
      showErrorMessage: true, errorTitle: 'סטטוס לא מוכר', error: 'יש לבחור: נוכחת, חסרה או מאושרת',
    };
  }

  const help = workbook.addWorksheet('הוראות', { views: [{ rightToLeft: true }] });
  help.columns = [{ header: 'עמודה', width: 22 }, { header: 'חובה / רשות', width: 14 }, { header: 'מה למלא', width: 70 }];
  help.getRow(1).font = { bold: true };
  for (const c of COLUMNS) help.addRow([c.header.replace(/ \(.*\)$/, ''), c.required ? 'חובה' : 'רשות', c.hint]);
  help.addRow([]);
  for (const line of [
    'כל שורה = תלמידה אחת במפגש אחד. לכמה מפגשים — מעתיקים את רשימת התלמידות שוב עם תאריך אחר.',
    'שורה בלי תאריך ובלי סטטוס מדלגים עליה, כך שאפשר להשאיר תלמידות לא מסומנות.',
    'המפגש נמצא לפי התאריך. אם אין עדיין מפגש בתאריך הזה — הוא נוצר, ומקושר לשיעור באתר שתאריכו זהה (אם יש כזה).',
    'ייבוא חוזר מעדכן את הסימון הקיים ולא יוצר כפילויות.',
  ]) help.addRow(['', '', line]);

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

type ImportRow = { rowNumber: number; email: string; day: Date; status: AttendanceStatus; note: string | null; topic: string | null };

const sameText = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

export async function importAttendance(courseId: string, buffer: Buffer) {
  const course = await requireCourse(courseId);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new AppError('Unreadable workbook', 'לא הצלחנו לקרוא את הקובץ. יש להעלות קובץ אקסל (xlsx.)', 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('Empty workbook', 'הקובץ ריק', 400);

  // Columns are found by their header, so their order in the file doesn't matter.
  const col: Partial<Record<ColumnKey, number>> = {};
  sheet.getRow(1).eachCell((cell, n) => {
    const text = cellText(cell).trim();
    const found = COLUMNS.find((c) => c.match.test(text) && col[c.key] === undefined);
    if (found) col[found.key] = n;
  });
  const missing = COLUMNS.filter((c) => c.required && col[c.key] === undefined).map((c) => c.header.replace(/ \(.*\)$/, ''));
  if (missing.length) {
    throw new AppError('Missing columns', `חסרות עמודות חובה בשורה הראשונה: ${missing.join(', ')}. מומלץ להתחיל מקובץ הדוגמה.`, 400);
  }
  if (sheet.rowCount > MAX_ROWS + 1) throw new AppError('Too many rows', `אפשר לייבא עד ${MAX_ROWS} שורות בכל פעם`, 400);

  const read = (row: ExcelJS.Row, key: ColumnKey): Cell | null => (col[key] ? row.getCell(col[key]!) : null);
  const errors: string[] = [];
  const rows: ImportRow[] = [];
  let skipped = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const dateCell = read(row, 'date')!;
    const rawStatus = cellText(read(row, 'status')!).trim();
    const rawDate = dateCell.value;
    if ((rawDate === null || rawDate === undefined || cellText(dateCell).trim() === '') && !rawStatus) { skipped++; return; }

    const email = cellText(read(row, 'email')!).trim().toLowerCase();
    if (!email) { errors.push(`שורה ${rowNumber}: חסר מייל`); return; }
    if (!isValidEmail(email)) { errors.push(`שורה ${rowNumber}: המייל אינו תקין (${email})`); return; }
    const day = parseDay(rawDate instanceof Date || typeof rawDate === 'number' ? rawDate : cellText(dateCell));
    if (!day) { errors.push(`שורה ${rowNumber}: חסר תאריך או שאינו תקין — למשל 15/10/2026`); return; }
    const status = parseStatus(rawStatus);
    if (!status) { errors.push(`שורה ${rowNumber}: סטטוס לא מוכר${rawStatus ? ` ("${rawStatus}")` : ''} — יש לכתוב נוכחת, חסרה או מאושרת`); return; }
    const noteCell = read(row, 'note');
    const topicCell = read(row, 'topic');
    rows.push({
      rowNumber, email, day, status,
      note: noteCell ? cellText(noteCell).trim().slice(0, MAX_NOTE) || null : null,
      topic: topicCell ? cellText(topicCell).trim().slice(0, MAX_TITLE) || null : null,
    });
  });

  const roster = await loadRoster(courseId, course.groupId);
  const byEmail = new Map(roster.map((s) => [s.email.toLowerCase(), s]));
  const [sessions, lessons] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { courseId }, select: { id: true, date: true, title: true, lesson: { select: { topic: true } } },
    }),
    prisma.lesson.findMany({ where: { courseId, lessonDate: { not: null } }, select: { id: true, topic: true, lessonDate: true } }),
  ]);
  const known = sessions.map((s) => ({ id: s.id, day: dayKey(s.date), title: s.title, lessonTopic: s.lesson?.topic ?? null }));
  let sessionsCreated = 0;

  async function sessionFor(day: Date, topic: string | null): Promise<string | { error: string }> {
    const key = dayKey(day);
    const onDay = known.filter((s) => s.day === key);
    if (topic) {
      const hit = onDay.filter((s) => sameText(s.title, topic) || sameText(s.lessonTopic, topic));
      if (hit.length === 1) return hit[0].id;
      if (hit.length > 1) return { error: `יש כמה מפגשים בתאריך הזה בשם "${topic}"` };
    } else if (onDay.length === 1) {
      return onDay[0].id;
    } else if (onDay.length > 1) {
      return { error: 'יש כמה מפגשים בתאריך הזה — יש למלא את עמודת נושא המפגש כדי לבחור ביניהם' };
    }
    const lessonsOnDay = lessons.filter((l) => dayKey(l.lessonDate!) === key);
    const lesson = topic ? lessonsOnDay.find((l) => sameText(l.topic, topic)) : lessonsOnDay.length === 1 ? lessonsOnDay[0] : undefined;
    const created = await prisma.attendanceSession.create({
      data: { courseId, date: day, lessonId: lesson?.id ?? null, title: lesson ? null : topic },
      select: { id: true },
    });
    known.push({ id: created.id, day: key, title: lesson ? null : topic, lessonTopic: lesson?.topic ?? null });
    sessionsCreated++;
    return created.id;
  }

  let saved = 0;
  for (const r of rows) {
    const student = byEmail.get(r.email);
    if (!student) { errors.push(`שורה ${r.rowNumber}: ${r.email} לא רשומה לקורס הזה`); continue; }
    if (student.excluded) { errors.push(`שורה ${r.rowNumber}: ${student.name} הוצאה מהנוכחות בקורס הזה`); continue; }
    const sessionId = await sessionFor(r.day, r.topic);
    if (typeof sessionId !== 'string') { errors.push(`שורה ${r.rowNumber}: ${sessionId.error}`); continue; }
    try {
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: student.id } },
        create: { sessionId, studentId: student.id, status: r.status, note: r.note },
        update: { status: r.status, ...(r.note ? { note: r.note } : {}) },
      });
      saved++;
    } catch {
      errors.push(`שורה ${r.rowNumber}: שגיאה בשמירת הסימון של ${r.email}`);
    }
  }

  return { saved, skipped, sessionsCreated, errors };
}

// ---------- student ----------

/**
 * The student's own attendance and homework, per course. Teacher notes are
 * deliberately left out, and lessons hidden from her show no topic or work.
 */
export async function getMyAttendance(studentId: string) {
  const courses = await prisma.course.findMany({
    where: {
      hidden: false,
      OR: [
        { group: { students: { some: { studentId } } } },
        { access: { some: { studentId } }, attendanceExclusions: { none: { studentId } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true,
      attendanceSessions: {
        orderBy: { date: 'desc' },
        select: {
          id: true, date: true, title: true,
          lesson: {
            select: {
              topic: true, hidden: true,
              assignments: {
                orderBy: { createdAt: 'asc' },
                select: { id: true, title: true, submissions: { where: { studentId }, select: { id: true } } },
              },
            },
          },
          records: { where: { studentId }, select: { status: true } },
          homework: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, title: true, marks: { where: { studentId, done: true }, select: { done: true } } },
          },
        },
      },
    },
  });

  return courses.map((c) => {
    const sessions = c.attendanceSessions.map((s) => {
      const lesson = s.lesson && !s.lesson.hidden ? s.lesson : null;
      return {
        id: s.id,
        date: s.date,
        title: s.title ?? lesson?.topic ?? null,
        status: s.records[0]?.status ?? null,
        homework: [
          ...(lesson?.assignments ?? []).map((a) => ({ id: a.id, title: a.title, kind: 'site' as const, done: a.submissions.length > 0 })),
          ...s.homework.map((h) => ({ id: h.id, title: h.title, kind: 'extra' as const, done: h.marks.length > 0 })),
        ],
      };
    });
    const count = (st: AttendanceStatus) => sessions.filter((s) => s.status === st).length;
    return {
      courseId: c.id,
      courseName: c.name,
      summary: { present: count('PRESENT'), absent: count('ABSENT'), excused: count('EXCUSED'), sessions: sessions.length },
      sessions,
    };
  });
}
