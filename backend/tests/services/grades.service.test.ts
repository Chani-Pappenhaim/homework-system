import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    grade: { upsert: vi.fn() },
    submission: { findMany: vi.fn() },
  },
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import { gradeSubmission, getReport, getPendingGrades, exportReport } from '../../src/services/grades.service';

const p = prisma as any;
beforeEach(() => vi.clearAllMocks());

describe('grades.service.gradeSubmission', () => {
  it('upserts with create + update payloads', async () => {
    p.grade.upsert.mockResolvedValue({ id: 'gr1' });
    await gradeSubmission('sub1', 'teacher1', { submissionScore: 88, contentScore: 75, feedback: 'nice' });
    const arg = p.grade.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ submissionId: 'sub1' });
    expect(arg.create).toMatchObject({ submissionId: 'sub1', gradedById: 'teacher1', submissionScore: 88, contentScore: 75, feedback: 'nice' });
    expect(arg.update).toMatchObject({ submissionScore: 88, contentScore: 75, feedback: 'nice', gradedById: 'teacher1' });
    expect(arg.update.gradedAt).toBeInstanceOf(Date);
  });
});

describe('grades.service.getReport', () => {
  it('applies groupId and courseId filters into the nested where', async () => {
    p.submission.findMany.mockResolvedValue([]);
    await getReport({ groupId: 'g1', courseId: 'c1' });
    const where = p.submission.findMany.mock.calls[0][0].where;
    expect(where.assignment.lesson.course).toEqual({ groupId: 'g1', id: 'c1' });
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
      where: { grade: null },
    }));
    expect(r.count).toBe(1);
    expect(r.submissions[0]).toMatchObject({ id: 's1', studentName: 'A', assignmentTitle: 'T' });
  });
});

describe('grades.service.exportReport', () => {
  it('produces a non-empty xlsx buffer with a header + data row', async () => {
    p.submission.findMany.mockResolvedValue([
      {
        student: { name: 'A', email: 'a@x.com', studentGroups: [{ group: { name: 'G' } }] },
        assignment: { title: 'T', deadline: new Date('2026-01-01'), lesson: { topic: 'Topic', course: { name: 'C' } } },
        submittedAt: new Date('2026-01-02'), isLate: true, grade: { submissionScore: 80, contentScore: 72, feedback: 'ok', checklist: null },
      },
    ]);
    const buf = await exportReport({});
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array || buf.byteLength > 0).toBeTruthy();

    // reload the produced workbook to confirm contents
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const sheet = wb.getWorksheet('Grades')!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Student Name');
    expect(sheet.getRow(1).getCell(10).value).toBe('Submission Score');
    expect(sheet.getRow(1).getCell(11).value).toBe('Content Score');
    expect(sheet.getRow(2).getCell(1).value).toBe('A');
    expect(sheet.getRow(2).getCell(9).value).toBe('Yes'); // Late
    expect(sheet.getRow(2).getCell(10).value).toBe(80); // Submission Score
    expect(sheet.getRow(2).getCell(11).value).toBe(72); // Content Score
  });
});
