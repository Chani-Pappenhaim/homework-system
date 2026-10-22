import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    grade: { upsert: vi.fn() },
    submission: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import { gradeSubmission, getReport, getPendingGrades, exportReport } from '../../src/services/grades.service';

const p = prisma as any;
beforeEach(() => vi.clearAllMocks());

describe('grades.service.gradeSubmission', () => {
  beforeEach(() => p.submission.findUnique.mockResolvedValue({ id: 'sub1' }));

  it('upserts with create + update payloads', async () => {
    p.grade.upsert.mockResolvedValue({ id: 'gr1' });
    await gradeSubmission('sub1', 'teacher1', { submissionScore: 88, contentScore: 75, feedback: 'nice' });
    const arg = p.grade.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ submissionId: 'sub1' });
    expect(arg.create).toMatchObject({ submissionId: 'sub1', gradedById: 'teacher1', submissionScore: 88, contentScore: 75, feedback: 'nice' });
    expect(arg.update).toMatchObject({ submissionScore: 88, contentScore: 75, feedback: 'nice', gradedById: 'teacher1' });
    expect(arg.update.gradedAt).toBeInstanceOf(Date);
  });

  it('rejects a score outside 0-100 or not a number', async () => {
    await expect(gradeSubmission('sub1', 't1', { contentScore: 150 })).rejects.toMatchObject({ status: 400 });
    await expect(gradeSubmission('sub1', 't1', { submissionScore: 'abc' as any })).rejects.toMatchObject({ status: 400 });
    await expect(gradeSubmission('sub1', 't1', { contentScore: -1 })).rejects.toMatchObject({ status: 400 });
    expect(p.grade.upsert).not.toHaveBeenCalled();
  });

  it('writes only the editable fields, never the approval flag', async () => {
    p.grade.upsert.mockResolvedValue({});
    await gradeSubmission('sub1', 't1', { contentScore: 90, contentApproved: true, submissionId: 'other' } as any);
    const arg = p.grade.upsert.mock.calls[0][0];
    expect(arg.update).not.toHaveProperty('contentApproved');
    expect(arg.create.submissionId).toBe('sub1');
  });

  it('is a 404 for a submission that no longer exists', async () => {
    p.submission.findUnique.mockResolvedValue(null);
    await expect(gradeSubmission('gone', 't1', { contentScore: 80 })).rejects.toMatchObject({ status: 404 });
  });
});

describe('grades.service.getReport', () => {
  it('applies groupId and courseId filters into the nested where', async () => {
    p.submission.findMany.mockResolvedValue([]);
    await getReport({ groupId: 'g1', courseId: 'c1' });
    const where = p.submission.findMany.mock.calls[0][0].where;
    expect(where.assignment.lesson.course).toEqual({ groupId: 'g1', id: 'c1' });
    expect(where.studentId).toBeUndefined();
  });

  it('keeps the submissions of the chosen days, both ends included', async () => {
    p.submission.findMany.mockResolvedValue([]);
    await getReport({ from: '2026-10-01', to: '2026-10-20' });
    expect(p.submission.findMany.mock.calls[0][0].where.submittedAt).toEqual({
      gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-10-21T00:00:00Z'),
    });
  });

  it('refuses a range that ends before it starts, without querying', async () => {
    await expect(getReport({ from: '2026-10-20', to: '2026-10-01' })).rejects.toMatchObject({ status: 400 });
    expect(p.submission.findMany).not.toHaveBeenCalled();
  });

  it('filters by studentId when given', async () => {
    p.submission.findMany.mockResolvedValue([]);
    await getReport({ studentId: 's1' });
    expect(p.submission.findMany.mock.calls[0][0].where.studentId).toBe('s1');
  });

  it("names the student's group that owns the course, not just her first group", async () => {
    p.submission.findMany.mockResolvedValue([{
      student: { name: 'A', email: 'a@x.com', studentGroups: [
        { groupId: 'g1', group: { name: 'Other' } }, { groupId: 'g2', group: { name: 'Course group' } },
      ] },
      assignment: { title: 'T', deadline: null, lesson: { topic: 'X', course: { name: 'C', groupId: 'g2' } } },
      submittedAt: new Date(), isLate: false, grade: null,
    }]);
    const rows = await getReport({});
    expect(rows[0].groupName).toContain('Course group');
  });

  it('flattens submissions into report rows with grade fallbacks', async () => {
    p.submission.findMany.mockResolvedValue([
      {
        student: { name: 'A', email: 'a@x.com', studentGroups: [{ group: { name: 'G' } }] },
        assignment: { title: 'T', deadline: null, lesson: { topic: 'Topic', course: { name: 'C' } } },
        submittedAt: new Date(), isLate: true, grade: null,
      },
    ]);
    const rows = await getReport({});
    expect(rows[0]).toMatchObject({
      studentName: 'A', groupName: 'G', courseName: 'C', lessonTopic: 'Topic',
      assignmentTitle: 'T', isLate: true, submissionScore: null, contentScore: null, feedback: null, checklist: null,
    });
  });

  it('uses empty group name when the student has no groups', async () => {
    p.submission.findMany.mockResolvedValue([
      {
        student: { name: 'A', email: 'a@x.com', studentGroups: [] },
        assignment: { title: 'T', deadline: null, lesson: { topic: 'Topic', course: { name: 'C' } } },
        submittedAt: new Date(), isLate: false, grade: { submissionScore: 70, contentScore: 65, feedback: 'ok', checklist: null },
      },
    ]);
    const rows = await getReport({});
    expect(rows[0].groupName).toBe('');
    expect(rows[0].submissionScore).toBe(70);
    expect(rows[0].contentScore).toBe(65);
  });
});

describe('grades.service.getPendingGrades', () => {
  it('queries ungraded submissions and returns a count + mapped list', async () => {
    p.submission.findMany.mockResolvedValue([
      { id: 's1', student: { name: 'A' }, assignment: { title: 'T' }, submittedAt: new Date() },
    ]);
    const r = await getPendingGrades();
    expect(p.submission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ grade: null }, { grade: { contentScore: null } }] },
    }));
    expect(r.count).toBe(1);
    expect(r.submissions[0]).toMatchObject({ id: 's1', studentName: 'A', assignmentTitle: 'T' });
  });
});

describe('grades.service.exportReport', () => {
  it('writes the report as a Hebrew right-to-left sheet, times as read in Israel', async () => {
    p.submission.findMany.mockResolvedValue([
      {
        student: { name: 'A', email: 'a@x.com', studentGroups: [{ group: { name: 'G' } }] },
        assignment: { title: 'T', deadline: new Date('2026-01-01T21:59:00Z'), lesson: { topic: 'Topic', course: { name: 'C' } } },
        submittedAt: new Date('2026-07-02T08:30:00Z'), isLate: true, grade: { submissionScore: 80, contentScore: 72, feedback: 'ok', checklist: null },
      },
    ]);
    const buf = await exportReport({});

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const sheet = wb.getWorksheet('ציונים')!;
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true });
    expect(sheet.getRow(1).getCell(1).value).toBe('שם התלמידה');
    expect(sheet.getRow(1).getCell(10).value).toBe('ציון הגשה');
    expect(sheet.getRow(1).getCell(11).value).toBe('ציון תוכן');
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe('A');
    // 23:59 in Israel's winter, 11:30 in its summer
    expect(row.getCell(7).value).toEqual(new Date('2026-01-01T23:59:00Z'));
    expect(row.getCell(8).value).toEqual(new Date('2026-07-02T11:30:00Z'));
    expect(row.getCell(9).value).toBe('כן');
    expect(row.getCell(10).value).toBe(80);
    expect(row.getCell(11).value).toBe(72);
  });
});
