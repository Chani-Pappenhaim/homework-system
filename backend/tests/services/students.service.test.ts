import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    assignment: { findMany: vi.fn() },
    submission: { findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    messageEntry: { findMany: vi.fn() },
    quizAttempt: { findMany: vi.fn() },
    teacherMessage: { findMany: vi.fn() },
  },
}));
vi.mock('../../src/services/attendance.service', () => ({ getMyAttendance: vi.fn() }));

import { prisma } from '../../src/config/prisma';
import { getMyAttendance } from '../../src/services/attendance.service';
import { getStudentsOverview, getStudentProfile } from '../../src/services/students.service';

const p = prisma as any;
const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 86_400_000);
const assignment = (id: string, groupId: string, deadline: Date | null, courseId = `c-${groupId}`, lessonId = `l-${id}`) =>
  ({ id, deadline, lessonId, lesson: { courseId, course: { groupId } } });

beforeEach(() => {
  vi.clearAllMocks();
  p.submission.findMany.mockResolvedValue([]);
  p.attendanceRecord.findMany.mockResolvedValue([]);
  p.messageEntry.findMany.mockResolvedValue([]);
  p.quizAttempt.findMany.mockResolvedValue([]);
  p.teacherMessage.findMany.mockResolvedValue([]);
  (getMyAttendance as any).mockResolvedValue([]);
});

describe('getStudentsOverview', () => {
  beforeEach(() => {
    p.user.findMany.mockResolvedValue([
      {
        id: 'rachel', name: 'רחל', email: 'r@x.com', githubUsername: 'rachel',
        studentGroups: [{ groupId: 'g1', group: { name: 'א', seminar: null, year: '2026' } }],
        courseAccess: [], lessonAccess: [{ lessonId: 'l-solo' }],
      },
      { id: 'dina', name: 'דינה', email: 'd@x.com', githubUsername: null, studentGroups: [], courseAccess: [], lessonAccess: [] },
    ]);
    p.assignment.findMany.mockResolvedValue([
      assignment('a1', 'g1', past),
      assignment('a2', 'g1', past),
      assignment('a3', 'g1', future),
      assignment('other', 'g2', past),
      assignment('solo', 'g2', null, 'c-g2', 'l-solo'),
    ]);
  });

  it('counts only the assignments the student can reach', async () => {
    p.submission.findMany.mockResolvedValue([
      { studentId: 'rachel', assignmentId: 'a1', isLate: true, grade: { contentScore: 80 } },
      { studentId: 'rachel', assignmentId: 'solo', isLate: false, grade: { contentScore: 91 } },
      // A submission to an assignment that is now out of her reach is not counted.
      { studentId: 'rachel', assignmentId: 'other', isLate: false, grade: { contentScore: 0 } },
    ]);
    const [rachel, dina] = await getStudentsOverview();
    expect(rachel!.assignments).toEqual({ total: 4, submitted: 2, late: 1, missing: 1 });
    expect(rachel!.averageContentScore).toBe(86);
    expect(dina!.assignments).toEqual({ total: 0, submitted: 0, late: 0, missing: 0 });
    expect(dina!.averageContentScore).toBeNull();
  });

  it('sums attendance and leaves excused absences out of the rate', async () => {
    p.attendanceRecord.findMany.mockResolvedValue([
      { studentId: 'rachel', status: 'PRESENT' }, { studentId: 'rachel', status: 'PRESENT' },
      { studentId: 'rachel', status: 'PRESENT' }, { studentId: 'rachel', status: 'ABSENT' },
      { studentId: 'rachel', status: 'EXCUSED' },
    ]);
    const [rachel, dina] = await getStudentsOverview();
    expect(rachel!.attendance).toEqual({ present: 3, absent: 1, excused: 1, rate: 75 });
    expect(dina!.attendance.rate).toBeNull();
  });

  it('counts unread messages from each student', async () => {
    p.messageEntry.findMany.mockResolvedValue([
      { message: { studentId: 'dina' } }, { message: { studentId: 'dina' } },
    ]);
    const [rachel, dina] = await getStudentsOverview();
    expect(rachel!.unreadMessages).toBe(0);
    expect(dina!.unreadMessages).toBe(2);
    expect(p.messageEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { fromTeacher: false, isRead: false } }));
  });
});

describe('getStudentProfile', () => {
  beforeEach(() => {
    p.user.findFirst.mockResolvedValue({
      id: 'rachel', name: 'רחל', email: 'r@x.com', githubUsername: 'rachel', createdAt: past, emailVerifiedAt: null,
      studentGroups: [{ groupId: 'g1', group: { name: 'א', seminar: null, year: '2026' } }],
      courseAccess: [{ courseId: 'c9', course: { name: 'קורס נוסף' } }],
      lessonAccess: [],
    });
    p.assignment.findMany.mockResolvedValue([
      {
        id: 'a1', title: 'תרגיל 1', deadline: past, lesson: { topic: 'מבוא', course: { name: 'JS' } },
        submissions: [{
          id: 's1', submittedAt: past, isLate: false, githubUrl: 'https://github.com/rachel/x', fileName: null, aiStatus: 'done',
          grade: { submissionScore: 100, contentScore: 72, contentApproved: false },
        }],
      },
      { id: 'a2', title: 'תרגיל 2', deadline: past, lesson: { topic: 'לולאות', course: { name: 'JS' } }, submissions: [] },
      { id: 'a3', title: 'תרגיל 3', deadline: future, lesson: { topic: 'מערכים', course: { name: 'JS' } }, submissions: [] },
    ]);
  });

  it('refuses an unknown id or a non-student', async () => {
    p.user.findFirst.mockResolvedValue(null);
    await expect(getStudentProfile('nope')).rejects.toMatchObject({ status: 404 });
    expect(p.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'nope', role: 'STUDENT' } }));
  });

  it('lists her work with grades the teacher sees even before approval', async () => {
    const profile = await getStudentProfile('rachel');
    expect(profile.student).toMatchObject({ groupNames: [expect.any(String)], extraCourses: ['קורס נוסף'], emailVerified: false });
    expect(profile.work.map((w) => [w.assignmentId, w.overdue])).toEqual([['a1', false], ['a2', true], ['a3', false]]);
    expect(profile.work[0]!.submission).toMatchObject({ contentScore: 72, contentApproved: false, submissionScore: 100 });
    // Her reach: the group's courses, granted courses and granted lessons, never hidden ones.
    const where = p.assignment.findMany.mock.calls[0][0].where.lesson;
    expect(where).toMatchObject({ hidden: false, course: { hidden: false } });
    expect(where.OR).toEqual([{ course: { groupId: { in: ['g1'] } } }, { courseId: { in: ['c9'] } }, { id: { in: [] } }]);
  });

  it('adds the teacher notes and rate to each course attendance', async () => {
    (getMyAttendance as any).mockResolvedValue([{
      courseId: 'c1', courseName: 'JS',
      summary: { present: 1, absent: 1, excused: 0, sessions: 2 },
      sessions: [
        { id: 'x1', date: past, title: 'מפגש 1', status: 'PRESENT', homework: [] },
        { id: 'x2', date: past, title: 'מפגש 2', status: 'ABSENT', homework: [] },
      ],
    }]);
    p.attendanceRecord.findMany.mockResolvedValue([{ sessionId: 'x2', note: 'חולה' }]);
    const { attendance } = await getStudentProfile('rachel');
    expect(attendance[0]!.summary.rate).toBe(50);
    expect(attendance[0]!.sessions.map((s) => s.note)).toEqual([null, 'חולה']);
  });

  it('keeps the first attempt as the official quiz score and counts the practice ones', async () => {
    const lesson = { lesson: { topic: 'מבוא', course: { name: 'JS' } } };
    p.quizAttempt.findMany.mockResolvedValue([
      { quizId: 'q1', score: 60, takenAt: past, isOfficial: true, quiz: lesson },
      { quizId: 'q1', score: 95, takenAt: future, isOfficial: false, quiz: lesson },
    ]);
    const { quizzes } = await getStudentProfile('rachel');
    expect(quizzes).toEqual([expect.objectContaining({ quizId: 'q1', officialScore: 60, bestScore: 95, attempts: 2 })]);
  });

  it('summarizes message threads, newest first', async () => {
    p.teacherMessage.findMany.mockResolvedValue([
      { id: 'm1', createdAt: past, assignmentId: null, entries: [{ fromTeacher: true, content: 'שלום', isRead: true, createdAt: past }] },
      {
        id: 'm2', createdAt: past, assignmentId: 'a2',
        entries: [
          { fromTeacher: false, content: 'אפשר הארכה?', isRead: false, createdAt: future },
          { fromTeacher: false, content: 'שלום', isRead: false, createdAt: past },
        ],
      },
    ]);
    const { messages } = await getStudentProfile('rachel');
    expect(messages.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(messages[0]).toMatchObject({ assignmentTitle: 'תרגיל 2', preview: 'אפשר הארכה?', unread: 2, lastFromTeacher: false });
  });
});
