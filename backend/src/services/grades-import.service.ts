import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { buildGradesWorkbook, readGradesSheet, type GradesSheetRow } from '../utils/grades-sheet';
import { loadRoster } from './roster.service';
import { assignmentWithCourse } from './submissions-import.service';
import { gradeSubmission } from './grades.service';
import { bulkApproveContentScore } from './submission-ai-review.service';

const TRANSACTION_TIMEOUT_MS = 30_000;

/** A student of the assignment's course and what she has handed in and been given so far. */
export interface GradingEntry {
  studentId: string;
  name: string;
  email: string;
  submission: {
    id: string;
    isLate: boolean;
    grade: { submissionScore: number | null; contentScore: number | null; contentApproved: boolean; feedback: string | null } | null;
  } | null;
}

/** One submission whose grade the sheet changes; only the changed fields are set. */
export interface PlannedGrade {
  rowNumber: number;
  submissionId: string;
  studentName: string;
  email: string;
  submissionScore?: number;
  contentScore?: number;
  feedback?: string;
  /** The grade would reach the student once published. */
  publishable: boolean;
}

export interface GradesImportPlan {
  updates: PlannedGrade[];
  /** Filled-in rows that match the grades already saved. */
  unchanged: number;
  /** Rows with nothing filled in. */
  empty: number;
  errors: string[];
}

async function loadGradingEntries(assignmentId: string): Promise<GradingEntry[]> {
  const assignment = await assignmentWithCourse(assignmentId);
  const { id: courseId, groupId } = assignment.lesson.course;
  const [roster, submissions] = await Promise.all([
    loadRoster(courseId, groupId),
    prisma.submission.findMany({
      where: { assignmentId },
      select: {
        id: true, studentId: true, isLate: true,
        grade: { select: { submissionScore: true, contentScore: true, contentApproved: true, feedback: true } },
      },
    }),
  ]);
  const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
  return roster.map((r) => ({ studentId: r.id, name: r.name, email: r.email, submission: byStudent.get(r.id) ?? null }));
}

function statusOf(entry: GradingEntry): string {
  if (!entry.submission) return 'לא הגישה';
  return entry.submission.isLate ? 'הגישה באיחור' : 'הגישה';
}

/** The sheet for grading one assignment: every student of its course, with her current grades. */
export async function buildGradesTemplate(assignmentId: string): Promise<Buffer> {
  const assignment = await assignmentWithCourse(assignmentId);
  const entries = await loadGradingEntries(assignmentId);
  return buildGradesWorkbook(assignment.title, entries.map((e) => ({
    name: e.name,
    email: e.email,
    status: statusOf(e),
    submissionScore: e.submission?.grade?.submissionScore ?? null,
    contentScore: e.submission?.grade?.contentScore ?? null,
    feedback: e.submission?.grade?.feedback ?? null,
  })));
}

/**
 * Matches the sheet's rows against the course's students and their grades:
 * which grades would change, which rows already match, and which cannot be
 * applied (an unknown student, or one who did not submit).
 */
export function planGradesImport(
  rows: GradesSheetRow[], entries: GradingEntry[], parsed: { empty: number; errors: string[] },
): GradesImportPlan {
  const byEmail = new Map(entries.map((e) => [e.email.toLowerCase(), e]));
  const plan: GradesImportPlan = { updates: [], unchanged: 0, empty: parsed.empty, errors: [...parsed.errors] };

  for (const row of rows) {
    const entry = byEmail.get(row.email);
    if (!entry) { plan.errors.push(`שורה ${row.rowNumber}: ${row.email} אינה תלמידה בקורס של המטלה`); continue; }
    if (!entry.submission) { plan.errors.push(`שורה ${row.rowNumber}: ${entry.name} לא הגישה את המטלה, ולכן אי אפשר לתת לה ציון`); continue; }

    const grade = entry.submission.grade;
    const changes = {
      ...(row.submissionScore !== undefined && row.submissionScore !== (grade?.submissionScore ?? null) && { submissionScore: row.submissionScore }),
      ...(row.contentScore !== undefined && row.contentScore !== (grade?.contentScore ?? null) && { contentScore: row.contentScore }),
      ...(row.feedback !== undefined && row.feedback !== (grade?.feedback ?? null) && { feedback: row.feedback }),
    };
    if (Object.keys(changes).length === 0) { plan.unchanged++; continue; }

    const contentScore = changes.contentScore ?? grade?.contentScore ?? null;
    plan.updates.push({
      rowNumber: row.rowNumber,
      submissionId: entry.submission.id,
      studentName: entry.name,
      email: entry.email,
      ...changes,
      publishable: contentScore !== null && !grade?.contentApproved,
    });
  }
  return plan;
}

/** What applying the uploaded sheet would do, without saving anything. */
export async function previewGradesImport(assignmentId: string, buffer: Buffer): Promise<GradesImportPlan> {
  const parsed = await readGradesSheet(buffer);
  return planGradesImport(parsed.rows, await loadGradingEntries(assignmentId), parsed);
}

/**
 * Saves the uploaded sheet's grades, all or none: a file with any problem row
 * is refused whole, so a half-applied sheet never has to be untangled. With
 * `publish`, the content scores that were not yet visible are approved and
 * their students emailed, the same as approving them one by one.
 */
export async function applyGradesImport(assignmentId: string, buffer: Buffer, gradedById: string, publish: boolean) {
  const plan = await previewGradesImport(assignmentId, buffer);
  if (plan.errors.length > 0) {
    throw new AppError('Grades sheet has errors', `בקובץ יש ${plan.errors.length} שגיאות. יש לתקן אותן ולהעלות שוב`, 400);
  }

  await prisma.$transaction(async (tx) => {
    for (const { submissionScore, contentScore, feedback, submissionId } of plan.updates) {
      await gradeSubmission(submissionId, gradedById, { submissionScore, contentScore, feedback }, tx);
    }
  }, { timeout: TRANSACTION_TIMEOUT_MS });

  const published = publish
    ? (await bulkApproveContentScore(plan.updates.filter((u) => u.publishable).map((u) => u.submissionId))).approved
    : 0;
  return { updated: plan.updates.length, unchanged: plan.unchanged, empty: plan.empty, published };
}
