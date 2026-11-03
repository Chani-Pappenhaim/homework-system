import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: vi.fn(), submission: { findMany: vi.fn() } },
}));
vi.mock('../../src/services/roster.service', () => ({ loadRoster: vi.fn() }));
vi.mock('../../src/services/submissions-import.service', () => ({ assignmentWithCourse: vi.fn() }));
vi.mock('../../src/services/grades.service', () => ({ gradeSubmission: vi.fn() }));
vi.mock('../../src/services/submission-ai-review.service', () => ({ bulkApproveContentScore: vi.fn() }));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import { loadRoster } from '../../src/services/roster.service';
import { assignmentWithCourse } from '../../src/services/submissions-import.service';
import { gradeSubmission } from '../../src/services/grades.service';
import { bulkApproveContentScore } from '../../src/services/submission-ai-review.service';
import {
  planGradesImport, previewGradesImport, applyGradesImport, buildGradesTemplate, type GradingEntry,
} from '../../src/services/grades-import.service';

const p = prisma as any;
const HEADER = ['שם התלמידה', 'מייל התלמידה', 'סטטוס הגשה', 'ציון הגשה', 'ציון תוכן', 'משוב'];

const noGrade = { id: 'sub-a', isLate: false, grade: null };
const graded = {
  id: 'sub-b', isLate: true,
  grade: { submissionScore: 90, contentScore: 80, contentApproved: false, feedback: 'טוב' },
};
const entries: GradingEntry[] = [
  { studentId: 'a', name: 'אורית', email: 'a@x.com', submission: noGrade },
  { studentId: 'b', name: 'בתיה', email: 'b@x.com', submission: graded },
  { studentId: 'c', name: 'גילה', email: 'c@x.com', submission: null },
];
const parsed = { empty: 0, errors: [] as string[] };

describe('planGradesImport', () => {
  it('plans only the fields that differ from the saved grade', () => {
    const plan = planGradesImport(
      [{ rowNumber: 2, email: 'b@x.com', submissionScore: 90, contentScore: 95, feedback: 'טוב' }], entries, parsed,
    );
    expect(plan.updates).toEqual([
      { rowNumber: 2, submissionId: 'sub-b', studentName: 'בתיה', email: 'b@x.com', contentScore: 95, publishable: true },
    ]);
    expect(plan.unchanged).toBe(0);
  });

  it('counts a row that matches the saved grade as unchanged', () => {
    const plan = planGradesImport(
      [{ rowNumber: 3, email: 'b@x.com', submissionScore: 90, contentScore: 80, feedback: 'טוב' }], entries, parsed,
    );
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it('grades a submission that has no grade row yet', () => {
    const plan = planGradesImport([{ rowNumber: 2, email: 'a@x.com', contentScore: 70, feedback: 'נחמד' }], entries, parsed);
    expect(plan.updates[0]).toMatchObject({ submissionId: 'sub-a', contentScore: 70, feedback: 'נחמד', publishable: true });
  });

  it('finds the student whatever the case of the email', () => {
    const plan = planGradesImport([{ rowNumber: 2, email: 'a@x.com', contentScore: 70 }],
      [{ ...entries[0]!, email: 'A@X.com' }], parsed);
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toHaveLength(1);
  });

  it('reports a student who is not in the course', () => {
    const plan = planGradesImport([{ rowNumber: 4, email: 'zzz@x.com', contentScore: 70 }], entries, parsed);
    expect(plan.errors).toEqual(['שורה 4: zzz@x.com אינה תלמידה בקורס של המטלה']);
    expect(plan.updates).toEqual([]);
  });

  it('reports a student who did not submit', () => {
    const plan = planGradesImport([{ rowNumber: 5, email: 'c@x.com', contentScore: 70 }], entries, parsed);
    expect(plan.errors).toEqual(['שורה 5: גילה לא הגישה את המטלה, ולכן אי אפשר לתת לה ציון']);
  });

  it('is not publishable without a content score', () => {
    const plan = planGradesImport([{ rowNumber: 2, email: 'a@x.com', feedback: 'עוד לא מוכן' }], entries, parsed);
    expect(plan.updates[0]?.publishable).toBe(false);
  });

  it('is not publishable when the content score is already visible to the student', () => {
    const approved: GradingEntry[] = [{
      ...entries[1]!, submission: { ...graded, grade: { ...graded.grade, contentApproved: true } },
    }];
    const plan = planGradesImport([{ rowNumber: 2, email: 'b@x.com', feedback: 'חדש' }], approved, parsed);
    expect(plan.updates[0]?.publishable).toBe(false);
  });

  it('is publishable when only the feedback changes but a hidden content score exists', () => {
    const plan = planGradesImport([{ rowNumber: 2, email: 'b@x.com', feedback: 'חדש' }], entries, parsed);
    expect(plan.updates[0]).toMatchObject({ feedback: 'חדש', publishable: true });
  });

  it('carries over the parser problems and empty rows', () => {
    const plan = planGradesImport([], entries, { empty: 3, errors: ['שורה 2: חסר מייל'] });
    expect(plan.empty).toBe(3);
    expect(plan.errors).toEqual(['שורה 2: חסר מייל']);
  });
});

async function upload(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ציונים');
  ws.addRow(HEADER);
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

function mockCourse() {
  (assignmentWithCourse as any).mockResolvedValue({ id: 'asg', title: 'תרגיל 1', lesson: { course: { id: 'c1', groupId: 'g1' } } });
  (loadRoster as any).mockResolvedValue([
    { id: 'a', name: 'אורית', email: 'a@x.com' }, { id: 'b', name: 'בתיה', email: 'b@x.com' }, { id: 'c', name: 'גילה', email: 'c@x.com' },
  ]);
  p.submission.findMany.mockResolvedValue([
    { id: 'sub-a', studentId: 'a', isLate: false, grade: null },
    { id: 'sub-b', studentId: 'b', isLate: true, grade: graded.grade },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCourse();
  p.$transaction.mockImplementation(async (fn: any) => fn('tx-client'));
  (bulkApproveContentScore as any).mockResolvedValue({ approved: 1, skipped: 0 });
});

describe('previewGradesImport', () => {
  it('summarises the file without saving anything', async () => {
    const plan = await previewGradesImport('asg', await upload([['אורית', 'a@x.com', '', '', 70, 'יפה'], ['גילה', 'c@x.com', '', 50, '', '']]));
    expect(plan.updates).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(gradeSubmission).not.toHaveBeenCalled();
  });
});

describe('applyGradesImport', () => {
  it('saves every changed grade through the grading service in one transaction', async () => {
    const file = await upload([['אורית', 'a@x.com', '', 100, 70, 'יפה'], ['בתיה', 'b@x.com', '', '', 95, '']]);
    const result = await applyGradesImport('asg', file, 'teacher1', false);

    expect(p.$transaction).toHaveBeenCalledTimes(1);
    expect(gradeSubmission).toHaveBeenCalledTimes(2);
    expect(gradeSubmission).toHaveBeenCalledWith(
      'sub-a', 'teacher1', { submissionScore: 100, contentScore: 70, feedback: 'יפה' }, 'tx-client',
    );
    expect(gradeSubmission).toHaveBeenCalledWith(
      'sub-b', 'teacher1', { submissionScore: undefined, contentScore: 95, feedback: undefined }, 'tx-client',
    );
    expect(result).toEqual({ updated: 2, unchanged: 0, empty: 0, published: 0 });
    expect(bulkApproveContentScore).not.toHaveBeenCalled();
  });

  it('saves nothing when any row has a problem', async () => {
    const file = await upload([['אורית', 'a@x.com', '', '', 70, ''], ['גילה', 'c@x.com', '', '', 60, ''], ['x', 'a2@x.com', '', 120, '', '']]);
    await expect(applyGradesImport('asg', file, 'teacher1', true)).rejects.toMatchObject({
      status: 400, clientMessage: 'בקובץ יש 2 שגיאות. יש לתקן אותן ולהעלות שוב',
    });
    expect(p.$transaction).not.toHaveBeenCalled();
    expect(gradeSubmission).not.toHaveBeenCalled();
    expect(bulkApproveContentScore).not.toHaveBeenCalled();
  });

  it('does not publish when the save fails', async () => {
    (gradeSubmission as any).mockRejectedValueOnce(new Error('db down'));
    const file = await upload([['אורית', 'a@x.com', '', '', 70, '']]);
    await expect(applyGradesImport('asg', file, 'teacher1', true)).rejects.toThrow('db down');
    expect(bulkApproveContentScore).not.toHaveBeenCalled();
  });

  it('publishes the newly visible content scores after the save', async () => {
    const file = await upload([['אורית', 'a@x.com', '', '', 70, ''], ['אורית ב', 'b@x.com', '', '', '', 'רק משוב']]);
    const result = await applyGradesImport('asg', file, 'teacher1', true);
    expect(bulkApproveContentScore).toHaveBeenCalledWith(['sub-a', 'sub-b'], 'teacher1');
    expect(result.published).toBe(1);
  });

  it('skips publishing a row that has no content score', async () => {
    const file = await upload([['אורית', 'a@x.com', '', 80, '', '']]);
    await applyGradesImport('asg', file, 'teacher1', true);
    expect(bulkApproveContentScore).toHaveBeenCalledWith([], 'teacher1');
  });

  it('reports rows that already match as unchanged', async () => {
    const file = await upload([['בתיה', 'b@x.com', '', 90, 80, 'טוב']]);
    const result = await applyGradesImport('asg', file, 'teacher1', false);
    expect(result).toEqual({ updated: 0, unchanged: 1, empty: 0, published: 0 });
    expect(gradeSubmission).not.toHaveBeenCalled();
  });
});

describe('buildGradesTemplate', () => {
  it('lists every student of the course with her status and current grades', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildGradesTemplate('asg')) as any);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(2).values).toEqual([undefined, 'אורית', 'a@x.com', 'הגישה', '', '', '']);
    expect(sheet.getRow(3).values).toEqual([undefined, 'בתיה', 'b@x.com', 'הגישה באיחור', 90, 80, 'טוב']);
    expect(sheet.getRow(4).values).toEqual([undefined, 'גילה', 'c@x.com', 'לא הגישה', '', '', '']);
  });
});
