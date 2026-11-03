import type { Prisma } from '@prisma/client';

type GradeState = { gradedById: string | null; contentScore: number | null; feedback: string | null; contentApproved: boolean };

/**
 * A grade row with no grader is the automatic submission score created on
 * (re)submission; it stays "awaiting review" until the teacher grades or
 * approves it.
 */
export const AWAITING_REVIEW_WHERE: Prisma.SubmissionWhereInput = {
  OR: [{ grade: null }, { grade: { is: { gradedById: null, contentApproved: false } } }],
};

/** Whether the teacher still has to look at the submission. */
export function awaitingReview(g: Pick<GradeState, 'gradedById' | 'contentApproved'> | null | undefined): boolean {
  return !g || (g.gradedById == null && !g.contentApproved);
}

/** Whether the teacher graded, commented or approved — an AI review alone does not count. Locks the submission for the student. */
export function teacherChecked(g: GradeState | null | undefined): boolean {
  return Boolean(g && (g.gradedById || g.contentScore != null || g.feedback || g.contentApproved));
}
