import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';
import { groupDisplayName } from '../utils/group-name';
import { AppError } from '../utils/errors';
import { dayRangeWhere, type DayRange } from '../utils/date-range';
import { addReportSheet, israelClock } from '../utils/excel';

type GradeInput = {
  submissionScore?: number | null; contentScore?: number | null;
  feedback?: string | null; checklist?: { id: string; text: string; checked: boolean }[] | null;
};

/** `undefined` leaves the score as it is, `null` clears it, otherwise 0–100. */
function scoreField(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new AppError(`Invalid ${label}`, `${label} חייב להיות מספר בין 0 ל-100`, 400);
  }
  return n;
}

/**
 * Only the fields the teacher actually edits are written — never the approval
 * flag or the grader, which have their own actions — and every score is
 * checked to be a real number in range.
 */
function gradeData(data: GradeInput) {
  const out: Record<string, unknown> = {};
  const submissionScore = scoreField(data?.submissionScore, 'ציון ההגשה');
  const contentScore = scoreField(data?.contentScore, 'ציון התוכן');
  if (submissionScore !== undefined) out.submissionScore = submissionScore;
  if (contentScore !== undefined) out.contentScore = contentScore;
  if (data?.feedback !== undefined) {
    if (data.feedback !== null && typeof data.feedback !== 'string') throw new AppError('Invalid feedback', 'המשוב אינו תקין', 400);
    out.feedback = data.feedback || null;
  }
  if (data?.checklist !== undefined) {
    if (data.checklist !== null && !Array.isArray(data.checklist)) throw new AppError('Invalid checklist', 'רשימת הבדיקה אינה תקינה', 400);
    out.checklist = data.checklist ?? undefined;
  }
  return out;
}

export async function gradeSubmission(submissionId: string, gradedById: string, data: GradeInput) {
  const fields = gradeData(data);
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, select: { id: true } });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  return prisma.grade.upsert({
    where: { submissionId },
    create: { submissionId, gradedById, ...fields },
    update: { ...fields, gradedAt: new Date(), gradedById },
  });
}

/** The date range is of the submission day. */
export type ReportFilters = { groupId?: string; courseId?: string; studentId?: string } & DayRange;

export async function getReport(filters: ReportFilters) {
  const submittedAt = dayRangeWhere(filters);
  const submissions = await prisma.submission.findMany({
    where: {
      ...(filters.studentId && { studentId: filters.studentId }),
      ...(submittedAt && { submittedAt }),
      assignment: {
        lesson: {
          course: {
            ...(filters.groupId && { groupId: filters.groupId }),
            ...(filters.courseId && { id: filters.courseId }),
          },
        },
      },
    },
    include: {
      student: { include: { studentGroups: { include: { group: true } } } },
      assignment: { include: { lesson: { include: { course: true } } } },
      grade: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  return submissions.map((s) => ({
    submissionId: s.id,
    lessonId: s.assignment.lessonId,
    assignmentId: s.assignmentId,
    studentId: s.studentId,
    studentName: s.student.name,
    studentEmail: s.student.email,
    // A student can be in several groups; name the one this course belongs to.
    groupName: groupDisplayName(
      (s.student.studentGroups.find((sg) => sg.groupId === s.assignment.lesson.course.groupId)
        ?? s.student.studentGroups[0])?.group
    ),
    courseName: s.assignment.lesson.course.name,
    lessonTopic: s.assignment.lesson.topic,
    assignmentTitle: s.assignment.title,
    deadline: s.assignment.deadline,
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    submissionScore: s.grade?.submissionScore ?? null,
    contentScore: s.grade?.contentScore ?? null,
    feedback: s.grade?.feedback ?? null,
    checklist: s.grade?.checklist ?? null,
  }));
}

const EXPORT_COLUMNS = [
  { header: 'שם התלמידה', width: 22 }, { header: 'מייל', width: 28 }, { header: 'קבוצה', width: 18 },
  { header: 'קורס', width: 20 }, { header: 'שיעור', width: 24 }, { header: 'מטלה', width: 26 },
  { header: 'מועד אחרון', width: 17 }, { header: 'הוגש בתאריך', width: 17 }, { header: 'באיחור', width: 9 },
  { header: 'ציון הגשה', width: 11 }, { header: 'ציון תוכן', width: 11 }, { header: 'משוב', width: 50 },
];
const DATE_TIME = 'dd/mm/yyyy hh:mm';

/** The report as an Excel sheet, in Hebrew, with the same filters as on screen. */
export async function exportReport(filters: ReportFilters): Promise<Buffer> {
  const rows = await getReport(filters);

  const workbook = new ExcelJS.Workbook();
  const sheet = addReportSheet(workbook, 'ציונים', EXPORT_COLUMNS);
  for (const r of rows) {
    sheet.addRow([
      r.studentName, r.studentEmail, r.groupName, r.courseName,
      r.lessonTopic, r.assignmentTitle,
      r.deadline ? israelClock(r.deadline) : '', israelClock(r.submittedAt),
      r.isLate ? 'כן' : 'לא', r.submissionScore ?? '', r.contentScore ?? '', r.feedback ?? '',
    ]);
  }
  sheet.getColumn(7).numFmt = DATE_TIME;
  sheet.getColumn(8).numFmt = DATE_TIME;
  sheet.getColumn(12).alignment = { wrapText: true, vertical: 'top' };

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

export async function getPendingGrades() {
  // "Pending" means the teacher hasn't set a content score yet (or there is no grade at all).
  const submissions = await prisma.submission.findMany({
    where: { OR: [{ grade: null }, { grade: { contentScore: null } }] },
    include: {
      student: { select: { name: true } },
      assignment: { select: { title: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return {
    count: submissions.length,
    submissions: submissions.map((s) => ({
      id: s.id, studentName: s.student.name,
      assignmentTitle: s.assignment.title, submittedAt: s.submittedAt,
    })),
  };
}
