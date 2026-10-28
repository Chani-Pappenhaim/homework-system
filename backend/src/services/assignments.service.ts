import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { assertLessonAccess } from './access.service';
import { cellText } from '../utils/excel';
import { submissionFileLink } from '../utils/storage';
import { releaseFileUrls, submissionFileUrls } from './file-refs.service';
import { computeSubmissionScore, daysLate } from '../utils/grading';
import { getLatePolicy } from './settings.service';
import { AI_REFERENCE_FILES_INCLUDE, assignmentForViewer } from '../utils/assignment-view';
import ExcelJS from 'exceljs';

export async function getAssignments(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);
  const assignments = await prisma.assignment.findMany({
    where: { lessonId }, orderBy: { createdAt: 'asc' }, include: AI_REFERENCE_FILES_INCLUDE,
  });
  return assignments.map((a) => assignmentForViewer(a, role));
}

/**
 * The description is where the teacher writes what is expected and how it is
 * graded, so an assignment without one is not a usable assignment.
 */
function requireText(value: unknown, field: 'title' | 'description'): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    const label = field === 'title' ? 'כותרת המטלה' : 'תיאור המטלה';
    throw new AppError(`Assignment ${field} is required`, `${label} הוא שדה חובה`, 400);
  }
  return text;
}

function parseDeadline(deadline: unknown): Date {
  const date = new Date(deadline as string);
  if (typeof deadline !== 'string' || Number.isNaN(date.getTime())) {
    throw new AppError('Invalid deadline', 'תאריך ההגשה אינו תקין', 400);
  }
  return date;
}

// A minute of slack, so a deadline picked as "now" survives the trip to the server.
const PAST_DEADLINE_GRACE_MS = 60_000;

function rejectPastDeadline(deadline: Date) {
  if (deadline.getTime() < Date.now() - PAST_DEADLINE_GRACE_MS) {
    throw new AppError('Deadline is in the past', 'המועד האחרון כבר עבר - יש לבחור תאריך עתידי', 400);
  }
}

/** `null` clears the deadline, a string sets it, `undefined` leaves it as it is. */
function deadlineField(deadline: string | null | undefined) {
  if (deadline === undefined) return {};
  if (deadline === null || deadline === '') return { deadline: null };
  return { deadline: parseDeadline(deadline) };
}

// Fields a teacher may set on an assignment; anything else in the request body
// (lessonId, id, counters) is ignored rather than written through.
const EDITABLE_FIELDS = [
  'allowedTypes', 'allowGithub', 'allowFile', 'requirements', 'aiInstructions', 'aiReviewEnabled', 'aiReviewLarge',
] as const;

function editableFields(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) if (data[key] !== undefined) out[key] = data[key];
  // An emptied instructions box clears the stored prompt.
  if (typeof out.aiInstructions === 'string' && !out.aiInstructions.trim()) out.aiInstructions = null;
  return out;
}

/**
 * The lesson files the AI review should rely on, as a relation write: each must
 * belong to the assignment's own lesson. `undefined` leaves the choice as it is.
 */
async function aiReferenceFilesField(lessonId: string, ids: unknown, mode: 'connect' | 'set') {
  if (ids === undefined) return {};
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new AppError('aiReferenceFileIds must be a list of file ids', 'רשימת הקבצים לבדיקת ה-AI אינה תקינה', 400);
  }
  const unique = [...new Set(ids as string[])];
  const found = unique.length
    ? await prisma.lessonFile.count({ where: { id: { in: unique }, lessonId } })
    : 0;
  if (found !== unique.length) {
    throw new AppError('AI reference file is not in the assignment lesson', 'אחד הקבצים שנבחרו לבדיקת ה-AI אינו שייך לשיעור', 400);
  }
  return { aiReferenceFiles: { [mode]: unique.map((id) => ({ id })) } };
}

/**
 * After the deadline moves, each submission's lateness follows the new date.
 * An automatic submission score is recalculated with it - also when it stays
 * late, by a different number of days; a score the teacher set herself is
 * left alone.
 */
async function recomputeLateness(assignmentId: string, deadline: Date | null) {
  const submissions = await prisma.submission.findMany({
    where: { assignmentId },
    select: {
      id: true, submittedAt: true, isLate: true, checklist: true,
      grade: { select: { gradedById: true, submissionScore: true } },
    },
  });
  const policy = await getLatePolicy();
  for (const sub of submissions) {
    const isLate = deadline ? sub.submittedAt > deadline : false;
    if (isLate !== sub.isLate) await prisma.submission.update({ where: { id: sub.id }, data: { isLate } });
    if (sub.grade && !sub.grade.gradedById) {
      const submissionScore = computeSubmissionScore(daysLate(isLate, sub.submittedAt, deadline), sub.checklist, policy);
      if (submissionScore !== sub.grade.submissionScore) {
        await prisma.grade.update({ where: { submissionId: sub.id }, data: { submissionScore } });
      }
    }
  }
}

export async function createAssignment(lessonId: string, data: {
  title: string; description: string; deadline?: string | null;
  allowedTypes?: string[]; allowGithub?: boolean; allowFile?: boolean;
  requirements?: { id: string; text: string }[];
  aiInstructions?: string | null;
  aiReviewEnabled?: boolean;
  aiReviewLarge?: boolean;
  aiReferenceFileIds?: string[];
}) {
  const title = requireText(data.title, 'title');
  const description = requireText(data.description, 'description');
  const deadline = data.deadline ? parseDeadline(data.deadline) : undefined;
  if (deadline) rejectPastDeadline(deadline);
  const aiReferenceFiles = await aiReferenceFilesField(lessonId, data.aiReferenceFileIds, 'connect');
  const assignment = await prisma.assignment.create({
    data: {
      lessonId, ...editableFields(data), title, description,
      ...(deadline ? { deadline } : {}),
      ...aiReferenceFiles,
    },
    include: AI_REFERENCE_FILES_INCLUDE,
  });
  return assignmentForViewer(assignment, 'ADMIN');
}

export async function updateAssignment(id: string, data: Partial<{
  title: string; description: string; deadline: string | null;
  allowedTypes: string[]; allowGithub: boolean; allowFile: boolean;
  requirements: { id: string; text: string }[];
  aiInstructions: string | null;
  aiReviewEnabled: boolean;
  aiReviewLarge: boolean;
  aiReferenceFileIds: string[];
}>) {
  const fields: Record<string, unknown> = { ...editableFields(data), ...deadlineField(data.deadline) };
  if (data.title !== undefined) fields.title = requireText(data.title, 'title');
  if (data.description !== undefined) fields.description = requireText(data.description, 'description');

  const changesFiles = data.aiReferenceFileIds !== undefined;
  const before = 'deadline' in fields || changesFiles
    ? await prisma.assignment.findUnique({ where: { id }, select: { deadline: true, lessonId: true } })
    : null;
  if (changesFiles) {
    if (!before) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);
    Object.assign(fields, await aiReferenceFilesField(before.lessonId, data.aiReferenceFileIds, 'set'));
  }
  // Only a deadline that is being changed has to be in the future: editing
  // other details of an assignment whose deadline already passed stays allowed.
  const nextDeadline = fields.deadline as Date | null | undefined;
  if (nextDeadline && nextDeadline.getTime() !== before?.deadline?.getTime()) rejectPastDeadline(nextDeadline);
  const assignment = await prisma.assignment.update({ where: { id }, data: fields, include: AI_REFERENCE_FILES_INCLUDE });
  if ('deadline' in fields && before && before.deadline?.getTime() !== assignment.deadline?.getTime()) {
    await recomputeLateness(id, assignment.deadline);
  }
  return assignmentForViewer(assignment, 'ADMIN');
}

// Submissions go with the assignment by cascade; their stored files are
// released afterwards, best-effort.
export async function deleteAssignment(id: string) {
  const submitted = await submissionFileUrls({ assignmentId: id });
  await prisma.assignment.delete({ where: { id } });
  await releaseFileUrls(submitted);
}

export async function importAssignments(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];

  let imported = 0;
  const errors: string[] = [];

  for (let i = 2; i <= (sheet.lastRow?.number ?? 1); i++) {
    const row = sheet.getRow(i);
    const lessonId = cellText(row.getCell(1)).trim();
    const title = cellText(row.getCell(2)).trim();
    const description = cellText(row.getCell(3)).trim() || undefined;
    const deadline = cellText(row.getCell(4)).trim() || undefined;
    const allowedTypesRaw = cellText(row.getCell(5)).trim();
    const allowedTypes = allowedTypesRaw ? allowedTypesRaw.split(',').map((s) => s.trim()) : [];

    if (!lessonId || !title) { errors.push(`Row ${i}: missing lessonId or title`); continue; }
    if (!description) { errors.push(`Row ${i}: missing description`); continue; }
    const deadlineDate = deadline ? new Date(deadline) : undefined;
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) { errors.push(`Row ${i}: invalid deadline`); continue; }
    if (deadlineDate && deadlineDate.getTime() < Date.now() - PAST_DEADLINE_GRACE_MS) {
      errors.push(`Row ${i}: deadline is in the past`); continue;
    }

    try {
      await prisma.assignment.create({ data: { lessonId, title, description, deadline: deadlineDate, allowedTypes } });
      imported++;
    } catch {
      errors.push(`Row ${i}: failed to create assignment`);
    }
  }
  return { imported, errors };
}

export async function getAssignmentSubmissions(assignmentId: string, userId: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);

  const submissions = await prisma.submission.findMany({
    where: { assignmentId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      grade: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  return {
    assignment,
    submissions: submissions.map((s) => ({
      id: s.id, studentId: s.studentId,
      studentName: s.student.name, studentEmail: s.student.email,
      fileUrl: submissionFileLink(s, userId), fileName: s.fileName, githubUrl: s.githubUrl,
      notes: s.notes,
      submittedAt: s.submittedAt, isLate: s.isLate,
      aiStatus: s.aiStatus, aiScore: s.aiScore, aiApproved: s.aiApproved,
      aiCodeReview: s.aiCodeReview, aiVerbalReview: s.aiVerbalReview, aiExtraAllowed: s.aiExtraAllowed, changesAllowed: s.changesAllowed, aiError: s.aiError,
      grade: s.grade ? {
        submissionScore: s.grade.submissionScore, contentScore: s.grade.contentScore,
        contentApproved: s.grade.contentApproved,
        feedback: s.grade.feedback,
        checklist: s.grade.checklist, gradedAt: s.grade.gradedAt,
      } : null,
    })),
  };
}
