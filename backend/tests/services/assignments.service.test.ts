import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    assignment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
    submission: { findMany: vi.fn() },
  },
}));

const { assertLessonAccessMock } = vi.hoisted(() => ({ assertLessonAccessMock: vi.fn() }));
vi.mock('../../src/utils/access', () => ({ assertLessonAccess: assertLessonAccessMock }));

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
  it('deleteAssignment deletes by id', async () => {
    p.assignment.delete.mockResolvedValue({});
    await deleteAssignment('a1');
    expect(p.assignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
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
    const buf = await xlsxBuffer([['l1', 'Task A', '', '', '']]);
    const r = await importAssignments(buf);
    expect(r.imported).toBe(0);
    expect(r.errors.some((e) => e.includes('failed to create assignment'))).toBe(true);
  });
});

describe('assignments.service.createAssignment', () => {
  it('passes aiInstructions and requirements through, converting deadline to Date', async () => {
    p.assignment.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await createAssignment('l1', {
      title: 'Task', deadline: '2026-05-01T00:00:00.000Z',
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
    const r: any = await createAssignment('l1', { title: 'No deadline' });
    expect(r).not.toHaveProperty('deadline');
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
