import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    assignment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    submission: { findMany: vi.fn(), update: vi.fn() },
    grade: { update: vi.fn() },
  },
}));

const { assertLessonAccessMock } = vi.hoisted(() => ({ assertLessonAccessMock: vi.fn() }));
vi.mock('../../src/utils/access', () => ({ assertLessonAccess: assertLessonAccessMock }));
const { releaseMock, submittedUrlsMock } = vi.hoisted(() => ({ releaseMock: vi.fn(), submittedUrlsMock: vi.fn() }));
vi.mock('../../src/utils/file-refs', () => ({ releaseFileUrls: releaseMock, submissionFileUrls: submittedUrlsMock }));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import {
  createAssignment,
  updateAssignment,
  getAssignments,
  getAssignmentSubmissions,
  importAssignments,
  deleteAssignment,
} from '../../src/services/assignments.service';

const p = prisma as any;
beforeEach(() => {
  vi.clearAllMocks();
  assertLessonAccessMock.mockResolvedValue(undefined);
});

async function xlsxBuffer(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('S');
  sheet.addRow(['lessonId', 'title', 'description', 'deadline', 'allowedTypes']);
  rows.forEach((r) => sheet.addRow(r));
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

describe('assignments.service.getAssignments / deleteAssignment', () => {
  it('getAssignments queries by lessonId ordered by createdAt', async () => {
    p.assignment.findMany.mockResolvedValue([{ id: 'a1' }]);
    const r = await getAssignments('l1', 's1', 'STUDENT');
    expect(p.assignment.findMany).toHaveBeenCalledWith({ where: { lessonId: 'l1' }, orderBy: { createdAt: 'asc' } });
    expect(r).toEqual([{ id: 'a1' }]);
  });
  it('deleteAssignment deletes by id, then releases the files submitted to it', async () => {
    submittedUrlsMock.mockResolvedValue(['https://cdn/sub.pdf']);
    p.assignment.delete.mockResolvedValue({});
    await deleteAssignment('a1');
    expect(submittedUrlsMock).toHaveBeenCalledWith({ assignmentId: 'a1' });
    expect(p.assignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(releaseMock).toHaveBeenCalledWith(['https://cdn/sub.pdf']);
  });
});

describe('assignments.service.importAssignments', () => {
  it('imports valid rows and reports missing-field errors', async () => {
    p.assignment.create.mockResolvedValue({});
    const buf = await xlsxBuffer([
      ['l1', 'Task A', 'desc', '', 'js,ts'],
      ['', 'No lesson', '', '', ''],
    ]);
    const r = await importAssignments(buf);
    expect(r.imported).toBe(1);
    expect(r.errors.some((e) => e.includes('missing lessonId or title'))).toBe(true);
    expect(p.assignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lessonId: 'l1', title: 'Task A', allowedTypes: ['js', 'ts'] }),
    }));
  });

  it('records a per-row error when create throws', async () => {
    p.assignment.create.mockRejectedValue(new Error('db'));
    const buf = await xlsxBuffer([['l1', 'Task A', 'desc', '', '']]);
    const r = await importAssignments(buf);
    expect(r.imported).toBe(0);
    expect(r.errors.some((e) => e.includes('failed to create assignment'))).toBe(true);
  });

  it('skips a row with no description', async () => {
    const buf = await xlsxBuffer([['l1', 'Task A', '', '', '']]);
    const r = await importAssignments(buf);
    expect(r.imported).toBe(0);
    expect(r.errors.some((e) => e.includes('missing description'))).toBe(true);
    expect(p.assignment.create).not.toHaveBeenCalled();
  });
});

describe('assignments.service.createAssignment', () => {
  it('passes aiInstructions and requirements through, converting deadline to Date', async () => {
    p.assignment.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await createAssignment('l1', {
      title: 'Task', description: 'grading notes', deadline: '2026-05-01T00:00:00.000Z',
      aiInstructions: 'be strict', requirements: [{ id: 'r1', text: 'do X' }],
      allowGithub: true, allowFile: false,
    });
    expect(r.lessonId).toBe('l1');
    expect(r.aiInstructions).toBe('be strict');
    expect(r.requirements).toEqual([{ id: 'r1', text: 'do X' }]);
    expect(r.deadline).toBeInstanceOf(Date);
  });

  it('omits deadline entirely when not provided', async () => {
    p.assignment.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await createAssignment('l1', { title: 'No deadline', description: 'd' });
    expect(r).not.toHaveProperty('deadline');
  });

  it('rejects a missing or blank description', async () => {
    await expect(createAssignment('l1', { title: 'T' } as never)).rejects.toMatchObject({ status: 400 });
    await expect(createAssignment('l1', { title: 'T', description: '  ' })).rejects.toMatchObject({ status: 400 });
    expect(p.assignment.create).not.toHaveBeenCalled();
  });
});

describe('assignments.service.updateAssignment', () => {
  it('updates fields and converts deadline', async () => {
    p.assignment.update.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await updateAssignment('a1', { title: 'New', deadline: '2026-01-01T00:00:00.000Z' });
    expect(r.title).toBe('New');
    expect(r.deadline).toBeInstanceOf(Date);
  });
  it('leaves deadline out when not supplied', async () => {
    p.assignment.update.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await updateAssignment('a1', { title: 'New' });
    expect(r).not.toHaveProperty('deadline');
  });
  it('clears the deadline when sent null', async () => {
    p.assignment.update.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await updateAssignment('a1', { deadline: null });
    expect(r.deadline).toBeNull();
  });
  it('rejects blanking the description', async () => {
    await expect(updateAssignment('a1', { description: '' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('assignments.service.getAssignmentSubmissions', () => {
  it('throws 404 when the assignment is missing', async () => {
    p.assignment.findUnique.mockResolvedValue(null);
    await expect(getAssignmentSubmissions('a1')).rejects.toMatchObject({ status: 404 });
  });
  it('returns assignment plus mapped submissions (grade null when absent)', async () => {
    p.assignment.findUnique.mockResolvedValue({ id: 'a1', title: 'T' });
    p.submission.findMany.mockResolvedValue([
      {
        id: 's1', studentId: 'st1', student: { name: 'A', email: 'a@x.com' },
        fileUrl: null, fileName: null, githubUrl: 'g', notes: null,
        submittedAt: new Date(), isLate: false,
        aiStatus: null, aiScore: null, aiApproved: false, aiCodeReview: null, aiVerbalReview: null,
        grade: null,
      },
    ]);
    const r = await getAssignmentSubmissions('a1');
    expect(r.assignment).toMatchObject({ id: 'a1' });
    expect(r.submissions[0]).toMatchObject({ id: 's1', studentName: 'A', grade: null });
  });
});

describe('assignments.service hardening', () => {
  it('hides the private AI instructions from a student', async () => {
    p.assignment.findMany.mockResolvedValue([{ id: 'a1', title: 'T', aiInstructions: 'secret' }]);
    const asStudent: any[] = await getAssignments('l1', 's1', 'STUDENT');
    expect(asStudent[0]).not.toHaveProperty('aiInstructions');
    const asTeacher: any[] = await getAssignments('l1', 't1', 'ADMIN');
    expect(asTeacher[0].aiInstructions).toBe('secret');
  });

  it('rejects an invalid deadline', async () => {
    await expect(updateAssignment('a1', { deadline: 'not a date' })).rejects.toMatchObject({ status: 400 });
    await expect(createAssignment('l1', { title: 'T', description: 'D', deadline: 'nope' })).rejects.toMatchObject({ status: 400 });
  });

  it('never lets the body move the assignment to another lesson', async () => {
    p.assignment.update.mockResolvedValue({ id: 'a1', deadline: null });
    await updateAssignment('a1', { title: 'T', lessonId: 'other' } as any);
    expect(p.assignment.update.mock.calls[0][0].data).not.toHaveProperty('lessonId');
  });

  it('clears the AI instructions when the box is emptied', async () => {
    p.assignment.update.mockResolvedValue({ id: 'a1', deadline: null });
    await updateAssignment('a1', { aiInstructions: '  ' });
    expect(p.assignment.update.mock.calls[0][0].data.aiInstructions).toBeNull();
  });

  it('recomputes lateness and the automatic score after the deadline moves', async () => {
    p.assignment.findUnique.mockResolvedValue({ deadline: new Date('2026-01-01') });
    p.assignment.update.mockResolvedValue({ id: 'a1', deadline: new Date('2026-03-01') });
    p.submission.findMany.mockResolvedValue([
      { id: 's1', submittedAt: new Date('2026-02-01'), isLate: true, checklist: null, grade: { gradedById: null } },
      { id: 's2', submittedAt: new Date('2026-02-01'), isLate: true, checklist: null, grade: { gradedById: 't1' } },
      { id: 's3', submittedAt: new Date('2026-04-01'), isLate: true, checklist: null, grade: null },
    ]);
    await updateAssignment('a1', { deadline: '2026-03-01' });
    expect(p.submission.update).toHaveBeenCalledTimes(2);
    expect(p.submission.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { isLate: false } });
    expect(p.grade.update).toHaveBeenCalledTimes(1);
    expect(p.grade.update).toHaveBeenCalledWith({ where: { submissionId: 's1' }, data: { submissionScore: 100 } });
  });
});
