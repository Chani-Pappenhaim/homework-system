import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    course: { findUnique: vi.fn(), findMany: vi.fn() },
    lesson: { findUnique: vi.fn(), findMany: vi.fn() },
    studentGroup: { findMany: vi.fn() },
    courseAccess: { findMany: vi.fn() },
    attendanceExclusion: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    attendanceSession: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    attendanceRecord: { upsert: vi.fn((a) => ({ op: 'upsert', ...a })), deleteMany: vi.fn((a) => ({ op: 'delete', ...a })) },
    extraHomework: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    homeworkMark: { upsert: vi.fn((a) => ({ op: 'upsert', ...a })), deleteMany: vi.fn((a) => ({ op: 'delete', ...a })) },
    $transaction: vi.fn(async (ops) => ops),
  },
}));

import { prisma } from '../../src/config/prisma';
import {
  parseDay, parseStatus, loadRoster, createSession, createSessionsFromLessons, saveRecords,
  saveHomeworkMarks, setExclusion, buildAttendanceTemplate, importAttendance, getMyAttendance,
} from '../../src/services/attendance.service';

const p = prisma as any;
const student = (id: string, name: string) => ({ student: { id, name, email: `${id}@x.com` } });

beforeEach(() => {
  vi.clearAllMocks();
  p.course.findUnique.mockResolvedValue({ id: 'c1', name: 'קורס', groupId: 'g1' });
  // Rachel and Leah are in the group; Dina was let in personally.
  p.studentGroup.findMany.mockResolvedValue([student('rachel', 'רחל'), student('leah', 'לאה')]);
  p.courseAccess.findMany.mockResolvedValue([student('dina', 'דינה'), student('leah', 'לאה')]);
  p.attendanceExclusion.findMany.mockResolvedValue([]);
  p.attendanceSession.findUnique.mockResolvedValue({ id: 's1', courseId: 'c1' });
  p.attendanceSession.findMany.mockResolvedValue([]);
  p.lesson.findMany.mockResolvedValue([]);
});

describe('parseDay', () => {
  it('reads Israeli and ISO dates as a UTC calendar day', () => {
    expect(parseDay('15/10/2026')!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(parseDay('5.3.26')!.toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(parseDay('2026-10-15')!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(parseDay(new Date(Date.UTC(2026, 9, 15, 13, 30)))!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('reads an Excel serial number', () => {
    expect(parseDay(46310)!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('refuses impossible or unreadable dates', () => {
    expect(parseDay('31/02/2026')).toBeNull();
    expect(parseDay('אתמול')).toBeNull();
    expect(parseDay('')).toBeNull();
  });
});

describe('parseStatus', () => {
  it('understands the common ways of writing each status', () => {
    expect(parseStatus('נוכחת')).toBe('PRESENT');
    expect(parseStatus(' V ')).toBe('PRESENT');
    expect(parseStatus('חסרה')).toBe('ABSENT');
    expect(parseStatus('חיסור מאושר')).toBe('EXCUSED');
    expect(parseStatus('אולי')).toBeNull();
  });
});

describe('loadRoster', () => {
  it('lists group members and personal-access students once each', async () => {
    const roster = await loadRoster('c1', 'g1');
    expect(roster.map((s) => [s.id, s.source])).toEqual([['dina', 'access'], ['leah', 'group'], ['rachel', 'group']]);
  });

  it('marks an excluded personal-access student', async () => {
    p.attendanceExclusion.findMany.mockResolvedValue([{ studentId: 'dina' }]);
    const roster = await loadRoster('c1', 'g1');
    expect(roster.find((s) => s.id === 'dina')!.excluded).toBe(true);
  });
});

describe('sessions', () => {
  it('opens a class-only meeting with no lesson', async () => {
    p.attendanceSession.create.mockResolvedValue({ id: 's2' });
    await createSession('c1', { date: '2026-10-15', title: ' חזרה למבחן ' });
    expect(p.attendanceSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { courseId: 'c1', lessonId: null, date: new Date('2026-10-15T00:00:00Z'), title: 'חזרה למבחן' },
    }));
  });

  it('refuses a lesson from another course', async () => {
    p.lesson.findUnique.mockResolvedValue({ courseId: 'other' });
    await expect(createSession('c1', { date: '2026-10-15', lessonId: 'l9' })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a missing date', async () => {
    await expect(createSession('c1', {})).rejects.toMatchObject({ status: 400 });
  });

  it('opens a meeting for each dated lesson that has none and counts the undated ones', async () => {
    p.lesson.findMany.mockResolvedValue([
      { id: 'l1', lessonDate: new Date('2026-10-01T00:00:00Z') },
      { id: 'l2', lessonDate: null },
    ]);
    expect(await createSessionsFromLessons('c1')).toEqual({ created: 1, undated: 1 });
    expect(p.attendanceSession.createMany).toHaveBeenCalledWith({
      data: [{ courseId: 'c1', lessonId: 'l1', date: new Date('2026-10-01T00:00:00Z') }],
    });
  });
});

describe('saveRecords', () => {
  it('upserts marks and clears a mark set back to none', async () => {
    await saveRecords('s1', [
      { studentId: 'rachel', status: 'PRESENT' },
      { studentId: 'leah', status: 'EXCUSED', note: '  מחלה ' },
      { studentId: 'dina', status: null },
    ]);
    const ops = p.$transaction.mock.calls[0][0];
    expect(ops[0]).toMatchObject({ op: 'upsert', update: { status: 'PRESENT' } });
    expect(ops[1]).toMatchObject({ op: 'upsert', update: { status: 'EXCUSED', note: 'מחלה' } });
    expect(ops[2]).toMatchObject({ op: 'delete', where: { sessionId: 's1', studentId: 'dina' } });
  });

  it('refuses a student who is not on the course', async () => {
    await expect(saveRecords('s1', [{ studentId: 'stranger', status: 'PRESENT' }])).rejects.toMatchObject({ status: 400 });
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an unknown status', async () => {
    await expect(saveRecords('s1', [{ studentId: 'rachel', status: 'LATE' }])).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a body that is not a list', async () => {
    await expect(saveRecords('s1', { studentId: 'rachel' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('saveHomeworkMarks', () => {
  it('records done and removes not-done', async () => {
    p.extraHomework.findUnique.mockResolvedValue({ id: 'h1', session: { courseId: 'c1' } });
    await saveHomeworkMarks('h1', [{ studentId: 'rachel', done: true }, { studentId: 'leah', done: false }]);
    const ops = p.$transaction.mock.calls[0][0];
    expect(ops.map((o: any) => o.op)).toEqual(['upsert', 'delete']);
  });
});

describe('setExclusion', () => {
  it('leaves a personal-access student off the attendance', async () => {
    await setExclusion('c1', 'dina', true);
    expect(p.attendanceExclusion.upsert).toHaveBeenCalled();
  });

  it('never excludes a member of the course group', async () => {
    await expect(setExclusion('c1', 'rachel', true)).rejects.toMatchObject({ status: 400 });
    expect(p.attendanceExclusion.upsert).not.toHaveBeenCalled();
  });
});

async function sheetFrom(rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('נוכחות');
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

describe('buildAttendanceTemplate', () => {
  it('lists the course students and marks each column required or optional', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildAttendanceTemplate('c1')) as any);
    const sheet = wb.worksheets[0];
    const headers = (sheet.getRow(1).values as string[]).filter(Boolean);
    expect(headers).toEqual(['שם (רשות)', 'מייל תלמידה (חובה)', 'תאריך (חובה)', 'סטטוס (חובה)', 'הערה (רשות)', 'נושא המפגש (רשות)']);
    expect(sheet.getCell('B2').value).toBe('dina@x.com');
    expect(sheet.getCell('D2').dataValidation.formulae).toEqual(['"נוכחת,חסרה,מאושרת"']);
    expect(wb.getWorksheet('הוראות')).toBeDefined();
  });

  it('a filled-in template imports back', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildAttendanceTemplate('c1')) as any);
    const sheet = wb.worksheets[0];
    sheet.getCell('C2').value = new Date(Date.UTC(2026, 9, 15));
    sheet.getCell('D2').value = 'נוכחת';
    p.attendanceSession.create.mockResolvedValue({ id: 'new' });
    const result = await importAttendance('c1', (await wb.xlsx.writeBuffer()) as unknown as Buffer);
    // Dina filled; Leah and Rachel were left blank and are skipped quietly.
    expect(result).toEqual({ saved: 1, skipped: 2, sessionsCreated: 1, errors: [] });
  });
});

describe('importAttendance', () => {
  const HEAD = ['מייל תלמידה (חובה)', 'תאריך (חובה)', 'סטטוס (חובה)', 'הערה (רשות)', 'נושא המפגש (רשות)'];

  it('joins an existing meeting on that day and links a new one to the lesson of that day', async () => {
    p.attendanceSession.findMany.mockResolvedValue([{ id: 's1', date: new Date('2026-10-01T00:00:00Z'), title: null, lesson: null }]);
    p.lesson.findMany.mockResolvedValue([{ id: 'l2', topic: 'מערכים', lessonDate: new Date('2026-10-08T00:00:00Z') }]);
    p.attendanceSession.create.mockResolvedValue({ id: 's2' });
    const result = await importAttendance('c1', await sheetFrom([
      HEAD,
      ['rachel@x.com', '01/10/2026', 'נוכחת', '', ''],
      ['leah@x.com', '08/10/2026', 'מאושרת', 'מחלה', ''],
      ['rachel@x.com', '08/10/2026', 'חסרה', '', ''],
    ]));
    expect(result).toMatchObject({ saved: 3, sessionsCreated: 1, errors: [] });
    expect(p.attendanceSession.create).toHaveBeenCalledTimes(1);
    expect(p.attendanceSession.create.mock.calls[0][0].data).toMatchObject({ lessonId: 'l2', title: null });
    expect(p.attendanceRecord.upsert.mock.calls[0][0].where.sessionId_studentId.sessionId).toBe('s1');
  });

  it('reports every bad row by its number and still saves the good ones', async () => {
    p.attendanceSession.create.mockResolvedValue({ id: 's2' });
    const result = await importAttendance('c1', await sheetFrom([
      HEAD,
      ['rachel@x.com', '01/10/2026', 'נוכחת'],
      ['nobody@x.com', '01/10/2026', 'נוכחת'],
      ['leah@x.com', '31/02/2026', 'נוכחת'],
      ['leah@x.com', '01/10/2026', 'אולי'],
      ['not-an-email', '01/10/2026', 'נוכחת'],
    ]));
    expect(result.saved).toBe(1);
    expect(result.errors).toEqual([
      expect.stringMatching(/^שורה 4: .*תאריך/),
      expect.stringMatching(/^שורה 5: סטטוס לא מוכר/),
      expect.stringMatching(/^שורה 6: המייל אינו תקין/),
      expect.stringMatching(/^שורה 3: nobody@x.com לא רשומה/),
    ]);
  });

  it('asks for the topic when a day has two meetings', async () => {
    p.attendanceSession.findMany.mockResolvedValue([
      { id: 's1', date: new Date('2026-10-01T00:00:00Z'), title: 'בוקר', lesson: null },
      { id: 's2', date: new Date('2026-10-01T00:00:00Z'), title: 'ערב', lesson: null },
    ]);
    const result = await importAttendance('c1', await sheetFrom([
      HEAD,
      ['rachel@x.com', '01/10/2026', 'נוכחת', '', ''],
      ['leah@x.com', '01/10/2026', 'נוכחת', '', 'ערב'],
    ]));
    expect(result.saved).toBe(1);
    expect(result.errors[0]).toMatch(/^שורה 2: .*נושא המפגש/);
    expect(p.attendanceRecord.upsert.mock.calls[0][0].where.sessionId_studentId.sessionId).toBe('s2');
  });

  it('refuses a file missing a required column', async () => {
    await expect(importAttendance('c1', await sheetFrom([['מייל', 'תאריך'], ['rachel@x.com', '01/10/2026']])))
      .rejects.toMatchObject({ status: 400, clientMessage: expect.stringContaining('סטטוס') });
  });

  it('refuses a file that is not a spreadsheet', async () => {
    await expect(importAttendance('c1', Buffer.from('hello'))).rejects.toMatchObject({ status: 400 });
  });

  it('skips a student the teacher left off the attendance', async () => {
    p.attendanceExclusion.findMany.mockResolvedValue([{ studentId: 'dina' }]);
    const result = await importAttendance('c1', await sheetFrom([HEAD, ['dina@x.com', '01/10/2026', 'נוכחת']]));
    expect(result.saved).toBe(0);
    expect(result.errors[0]).toMatch(/הוצאה מהנוכחות/);
  });
});

describe('getMyAttendance', () => {
  it('shows status and homework without the teacher note or a hidden lesson', async () => {
    p.course.findMany.mockResolvedValue([{
      id: 'c1', name: 'קורס',
      attendanceSessions: [
        {
          id: 's1', date: new Date('2026-10-01T00:00:00Z'), title: null,
          lesson: { topic: 'לולאות', hidden: false, assignments: [{ id: 'a1', title: 'תרגיל', submissions: [{ id: 'x' }] }] },
          records: [{ status: 'PRESENT' }],
          homework: [{ id: 'h1', title: 'לקרוא פרק 3', marks: [] }],
        },
        {
          id: 's2', date: new Date('2026-10-08T00:00:00Z'), title: null,
          lesson: { topic: 'סוד', hidden: true, assignments: [{ id: 'a2', title: 'מוסתר', submissions: [] }] },
          records: [], homework: [],
        },
      ],
    }]);
    const [course] = await getMyAttendance('rachel');
    expect(course.summary).toEqual({ present: 1, absent: 0, excused: 0, sessions: 2 });
    expect(course.sessions[0]).toEqual({
      id: 's1', date: new Date('2026-10-01T00:00:00Z'), title: 'לולאות', status: 'PRESENT',
      homework: [
        { id: 'a1', title: 'תרגיל', kind: 'site', done: true },
        { id: 'h1', title: 'לקרוא פרק 3', kind: 'extra', done: false },
      ],
    });
    expect(course.sessions[1]).toMatchObject({ title: null, status: null, homework: [] });
    // The query itself never selects the note.
    const select = p.course.findMany.mock.calls[0][0].select.attendanceSessions.select.records.select;
    expect(select).toEqual({ status: true });
  });
});
