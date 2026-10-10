import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { assertLessonAccess } from '../utils/access';
import { cellText } from '../utils/excel';
import { toDeliveryUrl } from '../utils/storage';
import { computeSubmissionScore } from '../utils/grading';
import ExcelJS from 'exceljs';

export async function getAssignments(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);
  const assignments = await prisma.assignment.findMany({ where: { lessonId }, orderBy: { createdAt: 'asc' } });
  // aiInstructions is the teacher's private prompt to the AI — never ship it to a student.
  return role === 'ADMIN' ? assignments : assignments.map(({ aiInstructions, ...rest }) => rest);
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

/** `null` clears the deadline, a string sets it, `undefined` leaves it as it is. */
function deadlineField(deadline: string | null | undefined) {
  if (deadline === undefined) return {};
  if (deadline === null || deadline === '') return { deadline: null };
  return { deadline: parseDeadline(deadline) };
}

// Fields a teacher may set on an assignment; anything else in the request body
// (lessonId, id, counters) is ignored rather than written through.
const EDITABLE_FIELDS = ['allowedTypes', 'allowGithub', 'allowFile', 'requirements', 'aiInstructions'] as const;

function editableFields(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) if (data[key] !== undefined) out[key] = data[key];
  // An emptied instructions box clears the stored prompt.
  if (typeof out.aiInstructions === 'string' && !out.aiInstructions.trim()) out.aiInstructions = null;
  return out;
}

/**
 * After the deadline moves, each submission's lateness follows the new date.
 * An automatic submission score is recalculated with it; a score the teacher
 * set herself is left alone.
 */
async function recomputeLateness(assignmentId: string, deadline: Date | null) {
  const submissions = await prisma.submission.findMany({
    where: { assignmentId },
    select: { id: true, submittedAt: true, isLate: true, checklist: true, grade: { select: { gradedById: true } } },
  });
  for (const sub of submissions) {
    const isLate = deadline ? sub.submittedAt > deadline : false;
    if (isLate === sub.isLate) continue;
    await prisma.submission.update({ where: { id: sub.id }, data: { isLate } });
    if (sub.grade && !sub.grade.gradedById) {
      await prisma.grade.update({
        where: { submissionId: sub.id },
        data: { submissionScore: computeSubmissionScore(isLate, sub.checklist) },
      });
    }
  }
}

export async function createAssignment(lessonId: string, data: {
  title: string; description: string; deadline?: string | null;
  allowedTypes?: string[]; allowGithub?: boolean; allowFile?: boolean;
  requirements?: { id: string; text: string }[];
  aiInstructions?: string | null;
}) {
  const title = requireText(data.title, 'title');
  const description = requireText(data.description, 'description');
  return prisma.assignment.create({
    data: {
      lessonId, ...editableFields(data), title, description,
      ...(data.deadline ? { deadline: parseDeadline(data.deadline) } : {}),
    },
  });
}

export async function updateAssignment(id: string, data: Partial<{
  title: string; description: string; deadline: string | null;
  allowedTypes: string[]; allowGithub: boolean; allowFile: boolean;
  requirements: { id: string; text: string }[];
  aiInstructions: string | null;
}>) {
  const fields: Record<string, unknown> = { ...editableFields(data), ...deadlineField(data.deadline) };
  if (data.title !== undefined) fields.title = requireText(data.title, 'title');
  if (data.description !== undefined) fields.description = requireText(data.description, 'description');

  const before = 'deadline' in fields
    ? await prisma.assignment.findUnique({ where: { id }, select: { deadline: true } })
    : null;
  const assignment = await prisma.assignment.update({ where: { id }, data: fields });
  if (before && before.deadline?.getTime() !== assignment.deadline?.getTime()) {
    await recomputeLateness(id, assignment.deadline);
  }
  return assignment;
}

export async function deleteAssignment(id: string) {
  await prisma.assignment.delete({ where: { id } });
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

    try {
      await prisma.assignment.create({ data: { lessonId, title, description, deadline: deadline ? new Date(deadline) : undefined, allowedTypes } });
      imported++;
    } catch {
      errors.push(`Row ${i}: failed to create assignment`);
    }
  }
  return { imported, errors };
}

export async function getAssignmentSubmissions(assignmentId: string) {
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
      fileUrl: s.fileUrl ? toDeliveryUrl(s.fileUrl) : s.fileUrl, fileName: s.fileName, githubUrl: s.githubUrl,
      notes: s.notes,
      submittedAt: s.submittedAt, isLate: s.isLate,
      aiStatus: s.aiStatus, aiScore: s.aiScore, aiApproved: s.aiApproved,
      aiCodeReview: s.aiCodeReview, aiVerbalReview: s.aiVerbalReview, aiExtraAllowed: s.aiExtraAllowed, aiError: s.aiError,
      grade: s.grade ? {
        submissionScore: s.grade.submissionScore, contentScore: s.grade.contentScore,
        contentApproved: s.grade.contentApproved,
        feedback: s.grade.feedback,
        checklist: s.grade.checklist, gradedAt: s.grade.gradedAt,
      } : null,
    })),
  };
}
