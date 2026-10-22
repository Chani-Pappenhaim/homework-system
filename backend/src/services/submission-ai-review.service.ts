import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { aiReviewQueue } from '../infrastructure/queues/queues';
import { enqueueEmail } from '../infrastructure/queues/enqueue-email';
import { assertAiAvailable } from './ai-availability';

// The teacher turned AI review off for the assignment.
function assertAiReviewEnabled(submission: { assignment?: { aiReviewEnabled: boolean } | null }) {
  if (submission.assignment?.aiReviewEnabled === false) {
    throw new AppError('AI review is disabled for this assignment', 'בדיקת AI אינה פעילה במטלה זו', 400);
  }
}

export async function requestAiReview(submissionId: string, studentId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { select: { aiReviewEnabled: true } } },
  });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  if (submission.studentId !== studentId) throw new AppError('Forbidden', 'אין לך הרשאה לפעולה זו', 403);
  assertAiReviewEnabled(submission);
  const fileRef = (submission.fileName || submission.fileUrl || '').toLowerCase();
  const hasReviewableFile = fileRef.endsWith('.zip') || fileRef.endsWith('.docx');
  if (!submission.githubUrl && !hasReviewableFile) {
    throw new AppError(
      'Submission must be a GitHub URL, a .zip file, or a .docx file to request AI review',
      'בדיקת AI זמינה רק להגשות GitHub, קובץ ZIP או קובץ Word (.docx)',
      400
    );
  }

  const maxReviews = submission.aiExtraAllowed ? 2 : 1;
  if (submission.aiReviewCount >= maxReviews) {
    throw new AppError('AI review limit reached', 'מכסת בדיקות ה-AI עבור הגשה זו נוצלה', 400);
  }
  if (submission.aiStatus === 'pending') {
    throw new AppError('Review already in progress', 'בדיקת AI כבר מתבצעת עבור הגשה זו', 409);
  }
  // Before the claim, so a review that cannot run now does not use up her attempt.
  await assertAiAvailable();

  // Claim the review in one conditional write: two quick clicks (or two tabs)
  // both pass the checks above, but only one of them can flip the status.
  const claimed = await prisma.submission.updateMany({
    where: { id: submission.id, aiStatus: { not: 'pending' }, aiReviewCount: { lt: maxReviews } },
    data: { aiStatus: 'pending', aiError: null },
  });
  if (claimed.count === 0) {
    throw new AppError('Review already in progress', 'בדיקת AI כבר מתבצעת עבור הגשה זו', 409);
  }
  await aiReviewQueue.add(
    'review',
    { submissionId: submission.id },
    // GitHub and Gemini both fail transiently; without retries a blip costs the
    // student her one review attempt.
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
  );
}

/**
 * The teacher runs the AI review again — after editing the assignment's
 * instructions, say. It has no attempt limit and doesn't count against the
 * student's, and the new result waits for her approval like the first one.
 */
export async function rerunAiReview(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assignment: { select: { aiReviewEnabled: true } } },
  });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  assertAiReviewEnabled(submission);
  const fileRef = (submission.fileName || submission.fileUrl || '').toLowerCase();
  if (!submission.githubUrl && !fileRef.endsWith('.zip') && !fileRef.endsWith('.docx')) {
    throw new AppError(
      'Submission is not reviewable by AI',
      'בדיקת AI זמינה רק להגשות GitHub, קובץ ZIP או קובץ Word (.docx)',
      400
    );
  }
  if (submission.aiStatus === 'pending') {
    throw new AppError('Review already in progress', 'בדיקת AI כבר מתבצעת עבור הגשה זו', 400);
  }
  await assertAiAvailable();

  await prisma.submission.update({ where: { id: submissionId }, data: { aiStatus: 'pending', aiApproved: false, aiError: null } });
  await aiReviewQueue.add(
    'review',
    { submissionId, byTeacher: true },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
  );
}

export async function approveAiReview(submissionId: string, gradedById: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { grade: true } });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  // Also publishes the content score, matching the previous single-flag
  // behavior (aiApproved used to gate both the AI fields and contentScore).
  // A content score the teacher never set takes the AI's, so approving the AI
  // never publishes an empty content score.
  const fillFromAi = submission.grade?.contentScore == null && submission.aiScore != null
    ? { contentScore: submission.aiScore, gradedById, gradedAt: new Date() }
    : {};
  await prisma.grade.upsert({
    where: { submissionId },
    create: { submissionId, contentApproved: true, ...fillFromAi },
    update: { contentApproved: true, ...fillFromAi },
  });
  return prisma.submission.update({
    where: { id: submissionId },
    data: { aiApproved: true },
  });
}

/**
 * Approves and publishes the content score to the student for ANY submission,
 * not just ones that went through AI review — sends a notification email.
 */
export async function approveContentScore(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { grade: true, student: { select: { name: true, email: true } }, assignment: { select: { title: true } } },
  });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  if (submission.grade?.contentScore == null) {
    throw new AppError('No content score to approve', 'אין ציון תוכן לאשר', 400);
  }

  const grade = await prisma.grade.update({
    where: { submissionId },
    data: { contentApproved: true },
  });

  await enqueueEmail('grade-approved', {
    submissionId,
    studentEmail: submission.student.email,
    studentName: submission.student.name,
    assignmentTitle: submission.assignment.title,
    contentScore: grade.contentScore!,
  });

  return grade;
}

/** Best-effort bulk approve — submissions without a content score are skipped, not failed. */
export async function bulkApproveContentScore(submissionIds: string[]) {
  let approved = 0;
  for (const id of submissionIds) {
    try {
      await approveContentScore(id);
      approved++;
    } catch {
      // no content score yet, or submission not found — skip it
    }
  }
  return { approved, skipped: submissionIds.length - approved };
}

// Restores the grade's content score to the AI's score without a new AI
// request, since aiScore stays on the submission even after being overridden.
export async function restoreAiScore(submissionId: string, gradedById: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  if (submission.aiScore == null) {
    throw new AppError('No AI score for this submission', 'אין ציון AI להגשה זו', 400);
  }
  return prisma.grade.upsert({
    where: { submissionId: submission.id },
    create: { submissionId: submission.id, gradedById, contentScore: submission.aiScore },
    update: { contentScore: submission.aiScore, gradedAt: new Date(), gradedById },
  });
}

type AiReviewEdit = { aiScore?: unknown; aiVerbalReview?: unknown; aiCodeReview?: unknown };

/**
 * The teacher's correction of a finished AI review — its score and/or its
 * comments. A saved content score that still is the AI's follows the new AI
 * score; one the teacher set herself stays as it is. An unset one stays unset,
 * so the submission stays in her "to grade" queue (the grading form suggests
 * the AI score there).
 */
export async function updateAiReview(submissionId: string, edit: AiReviewEdit, gradedById: string) {
  const data: { aiScore?: number; aiVerbalReview?: string | null; aiCodeReview?: string | null } = {};
  if (edit?.aiScore !== undefined) {
    const n = typeof edit.aiScore === 'number' ? edit.aiScore : Number(edit.aiScore);
    if (edit.aiScore === null || edit.aiScore === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      throw new AppError('Invalid AI score', 'ציון ה-AI חייב להיות מספר בין 0 ל-100', 400);
    }
    data.aiScore = n;
  }
  for (const key of ['aiVerbalReview', 'aiCodeReview'] as const) {
    const value = edit?.[key];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') throw new AppError(`Invalid ${key}`, 'הערות ה-AI אינן תקינות', 400);
    data[key] = value?.trim() ? value : null;
  }
  if (Object.keys(data).length === 0) throw new AppError('Nothing to update', 'לא נשלח שינוי', 400);

  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { grade: true } });
  if (!submission) throw new AppError('Submission not found', 'ההגשה לא נמצאה', 404);
  if (submission.aiStatus !== 'done') {
    throw new AppError('No finished AI review', 'אין בדיקת AI שהסתיימה להגשה זו', 400);
  }

  const updated = await prisma.submission.update({ where: { id: submissionId }, data });
  const contentScore = submission.grade?.contentScore;
  if (data.aiScore !== undefined && contentScore != null && contentScore === submission.aiScore) {
    await prisma.grade.update({
      where: { submissionId },
      data: { contentScore: data.aiScore, gradedAt: new Date(), gradedById },
    });
  }
  return updated;
}

export async function allowExtraAiReview(submissionId: string) {
  await prisma.submission.update({
    where: { id: submissionId },
    data: { aiExtraAllowed: true },
  });
}
