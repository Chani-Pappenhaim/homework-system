import ExcelJS, { type Cell } from 'exceljs';
import type { AttendanceStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { addReportSheet, cellText, isValidEmail } from '../utils/excel';
import { dayRangeWhere, type DayRange } from '../utils/date-range';
import { MAX_NOTE, MAX_ROWS, MAX_TITLE, attendanceRate, dayKey, parseDay, utcDay } from './attendance-common';
import { loadRoster, requireCourse } from './roster.service';

const COLUMNS = [
  { key: 'name', header: 'שם (רשות)', match: /^שם/, required: false, hint: 'רק לנוחות הקריאה - המערכת מזהה את התלמידה לפי המייל.' },
  { key: 'email', header: 'מייל תלמידה (חובה)', match: /מייל|אימייל|email/i, required: true, hint: 'המייל שאיתו התלמידה רשומה לאתר.' },
  { key: 'date', header: 'תאריך (חובה)', match: /תאריך|date/i, required: true, hint: 'תאריך המפגש, למשל 15/10/2026.' },
  { key: 'status', header: 'סטטוס (חובה)', match: /סטטוס|status/i, required: true, hint: 'אחד מ: נוכחת / חסרה / חלקית (נוכחות חלקית - נחשבת חצי חיסור).' },
  { key: 'note', header: 'הערה (רשות)', match: /הערה|note/i, required: false, hint: 'הערה פנימית למורה - התלמידה לא רואה אותה.' },
  { key: 'topic', header: 'נושא המפגש (רשות)', match: /נושא|topic/i, required: false, hint: 'צריך רק אם היו כמה מפגשים באותו תאריך, או כדי לתת שם למפגש חדש.' },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

const STATUS_WORDS: Record<string, AttendanceStatus> = {
  'נוכחת': 'PRESENT', 'נוכח': 'PRESENT', 'נכחה': 'PRESENT', 'כן': 'PRESENT', 'v': 'PRESENT', '✓': 'PRESENT', '1': 'PRESENT', 'present': 'PRESENT',
  'חסרה': 'ABSENT', 'חסר': 'ABSENT', 'לא': 'ABSENT', 'x': 'ABSENT', '0': 'ABSENT', 'absent': 'ABSENT',
  'חלקית': 'PARTIAL', 'חלקי': 'PARTIAL', 'נוכחות חלקית': 'PARTIAL', 'partial': 'PARTIAL',
  // Words of the earlier "excused" status, which became partial attendance - older files still import.
  'מאושרת': 'PARTIAL', 'מאושר': 'PARTIAL', 'חיסור מאושר': 'PARTIAL', 'מוצדק': 'PARTIAL', 'excused': 'PARTIAL',
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
      type: 'list', allowBlank: true, formulae: ['"נוכחת,חסרה,חלקית"'],
      showErrorMessage: true, errorTitle: 'סטטוס לא מוכר', error: 'יש לבחור: נוכחת, חסרה או חלקית',
    };
  }

  const help = workbook.addWorksheet('הוראות', { views: [{ rightToLeft: true }] });
  help.columns = [{ header: 'עמודה', width: 22 }, { header: 'חובה / רשות', width: 14 }, { header: 'מה למלא', width: 70 }];
  help.getRow(1).font = { bold: true };
  for (const c of COLUMNS) help.addRow([c.header.replace(/ \(.*\)$/, ''), c.required ? 'חובה' : 'רשות', c.hint]);
  help.addRow([]);
  for (const line of [
    'כל שורה = תלמידה אחת במפגש אחד. לכמה מפגשים - מעתיקים את רשימת התלמידות שוב עם תאריך אחר.',
    'שורה בלי תאריך ובלי סטטוס מדלגים עליה, כך שאפשר להשאיר תלמידות לא מסומנות.',
    'המפגש נמצא לפי התאריך. אם אין עדיין מפגש בתאריך הזה - הוא נוצר, ומקושר לשיעור באתר שתאריכו זהה (אם יש כזה).',
    'ייבוא חוזר מעדכן את הסימון הקיים ולא יוצר כפילויות.',
  ]) help.addRow(['', '', line]);

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = { PRESENT: 'נוכחת', ABSENT: 'חסרה', PARTIAL: 'חלקית' };
const STATUS_FILL: Partial<Record<AttendanceStatus, string>> = { ABSENT: 'FFFDE2E1', PARTIAL: 'FFFEF3C7' };
const shortDay = (d: Date) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;

/**
 * The course's attendance over the chosen days, for Excel: a row per student,
 * a column per meeting, and her totals at the end. A meeting's note for a
 * student is attached to her cell.
 */
export async function buildAttendanceExport(courseId: string, range: DayRange): Promise<{ buffer: Buffer; courseName: string }> {
  const course = await requireCourse(courseId);
  const date = dayRangeWhere(range);
  const [roster, sessions] = await Promise.all([
    loadRoster(courseId, course.groupId),
    prisma.attendanceSession.findMany({
      where: { courseId, ...(date && { date }) },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { date: true, title: true, lesson: { select: { topic: true } }, records: { select: { studentId: true, status: true, note: true } } },
    }),
  ]);
  if (!sessions.length) {
    throw new AppError('No sessions in range', date ? 'אין מפגשים בתאריכים שנבחרו' : 'עוד לא נפתחו מפגשים בקורס הזה', 404);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = addReportSheet(workbook, 'נוכחות', [
    { header: 'שם התלמידה', width: 22 }, { header: 'מייל', width: 28 },
    ...sessions.map((s) => {
      const title = s.title ?? s.lesson?.topic;
      return { header: title ? `${shortDay(s.date)} · ${title}` : shortDay(s.date), width: 16 };
    }),
    { header: 'נוכחת', width: 9 }, { header: 'חסרה', width: 9 }, { header: 'חלקית', width: 9 }, { header: 'אחוז נוכחות', width: 12 },
  ]);
  sheet.getRow(1).alignment = { wrapText: true, vertical: 'top' };

  for (const student of roster.filter((s) => !s.excluded)) {
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, PARTIAL: 0 };
    const marks = sessions.map((s) => s.records.find((r) => r.studentId === student.id));
    for (const m of marks) if (m) counts[m.status]++;
    const rate = attendanceRate(counts.PRESENT, counts.ABSENT, counts.PARTIAL);
    const row = sheet.addRow([
      student.name, student.email,
      ...marks.map((m) => (m ? STATUS_LABEL[m.status] : null)),
      counts.PRESENT, counts.ABSENT, counts.PARTIAL, rate === null ? null : rate / 100,
    ]);
    marks.forEach((m, i) => {
      if (!m) return;
      const cell = row.getCell(i + 3);
      const fill = STATUS_FILL[m.status];
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      if (m.note) cell.note = m.note;
    });
  }
  sheet.getColumn(sessions.length + 6).numFmt = '0%';

  return { buffer: (await workbook.xlsx.writeBuffer()) as unknown as Buffer, courseName: course.name };
}

type ImportRow = {
  rowNumber: number; email: string; day: Date; status: AttendanceStatus; note: string | null; topic: string | null;
  /** The date came from a real Excel date, which Excel read by the computer's day/month order. */
  excelDate: boolean;
};

export type AttendanceImportResult = {
  dryRun: boolean;
  /** Marks saved - or, when dryRun, to be saved: */
  saved: number;
  /** of them, marks that change an existing one, */
  updated: number;
  /** marks for a student who had none in that meeting, */
  added: number;
  /** and marks that are already as in the file. */
  unchanged: number;
  skipped: number;
  sessionsCreated: number;
  /** The meetings opened (or to be opened), as "15/10/2026" or "15/10/2026 (topic)". */
  newSessions: string[];
  errors: string[];
};

const showDay = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/** The same date with day and month swapped, when that is a different valid date. */
function swappedDay(d: Date): Date | null {
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  if (day === month || day > 12) return null;
  return utcDay(d.getUTCFullYear(), day, month);
}

const sameText = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Reads the sheet and checks every row. With dryRun nothing is written, so the
 * teacher sees what will change - and which new meetings will open - before
 * confirming; without it, the valid rows are saved and the rest are reported.
 */
export async function importAttendance(
  courseId: string, buffer: Buffer, { dryRun = false } = {}
): Promise<AttendanceImportResult> {
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
    if (!day) { errors.push(`שורה ${rowNumber}: חסר תאריך או שאינו תקין - למשל 15/10/2026`); return; }
    const status = parseStatus(rawStatus);
    if (!status) { errors.push(`שורה ${rowNumber}: סטטוס לא מוכר${rawStatus ? ` ("${rawStatus}")` : ''} - יש לכתוב נוכחת, חסרה או חלקית`); return; }
    const noteCell = read(row, 'note');
    const topicCell = read(row, 'topic');
    rows.push({
      rowNumber, email, day, status, excelDate: rawDate instanceof Date || typeof rawDate === 'number',
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
  const existing = new Map(
    (await prisma.attendanceRecord.findMany({
      where: { session: { courseId } }, select: { sessionId: true, studentId: true, status: true },
    })).map((r) => [`${r.sessionId}:${r.studentId}`, r.status])
  );
  // Days the course already meets on, before this file opens any.
  const meetingDays = new Set([...known.map((s) => s.day), ...lessons.map((l) => dayKey(l.lessonDate!))]);
  const newSessions: string[] = [];

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
      return { error: 'יש כמה מפגשים בתאריך הזה - יש למלא את עמודת נושא המפגש כדי לבחור ביניהם' };
    }
    const lessonsOnDay = lessons.filter((l) => dayKey(l.lessonDate!) === key);
    const lesson = topic ? lessonsOnDay.find((l) => sameText(l.topic, topic)) : lessonsOnDay.length === 1 ? lessonsOnDay[0] : undefined;
    const id = dryRun
      ? `new:${known.length}`
      : (await prisma.attendanceSession.create({
          data: { courseId, date: day, lessonId: lesson?.id ?? null, title: lesson ? null : topic },
          select: { id: true },
        })).id;
    known.push({ id, day: key, title: lesson ? null : topic, lessonTopic: lesson?.topic ?? null });
    const name = lesson?.topic ?? topic;
    newSessions.push(name ? `${showDay(day)} (${name})` : showDay(day));
    return id;
  }

  let updated = 0, added = 0, unchanged = 0;
  for (const r of rows) {
    const student = byEmail.get(r.email);
    if (!student) { errors.push(`שורה ${r.rowNumber}: ${r.email} לא רשומה לקורס הזה`); continue; }
    if (student.excluded) { errors.push(`שורה ${r.rowNumber}: ${student.name} הוצאה מהנוכחות בקורס הזה`); continue; }
    // Excel reads a typed date by the computer's settings; set to month-first, 12/10
    // becomes December 10 and the row would open a meeting nobody had, leaving the
    // real one untouched. When only the swapped date is a meeting day, refuse the row.
    const swapped = r.excelDate ? swappedDay(r.day) : null;
    if (swapped && !meetingDays.has(dayKey(r.day)) && meetingDays.has(dayKey(swapped))) {
      errors.push(
        `שורה ${r.rowNumber}: האקסל קרא את התאריך כ-${showDay(r.day)}, ואין מפגש בתאריך הזה - אבל יש מפגש ב-${showDay(swapped)}. ` +
        'כנראה היום והחודש התהפכו בגלל הגדרות האזור של המחשב. יש לתקן את התאריך בקובץ, או להקליד אותו כטקסט עם גרש בהתחלה (למשל \'12/10/2026)'
      );
      continue;
    }
    const sessionId = await sessionFor(r.day, r.topic);
    if (typeof sessionId !== 'string') { errors.push(`שורה ${r.rowNumber}: ${sessionId.error}`); continue; }
    const key = `${sessionId}:${student.id}`;
    const before = existing.get(key);
    if (dryRun) {
      if (before === undefined) added++; else if (before === r.status) unchanged++; else updated++;
      existing.set(key, r.status);
      continue;
    }
    try {
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: student.id } },
        create: { sessionId, studentId: student.id, status: r.status, note: r.note },
        update: { status: r.status, ...(r.note ? { note: r.note } : {}) },
      });
      if (before === undefined) added++; else if (before === r.status) unchanged++; else updated++;
      existing.set(key, r.status);
    } catch {
      errors.push(`שורה ${r.rowNumber}: שגיאה בשמירת הסימון של ${r.email}`);
    }
  }

  return {
    dryRun, saved: updated + added + unchanged, updated, added, unchanged,
    skipped, sessionsCreated: newSessions.length, newSessions, errors,
  };
}
