/**
 * Automatic submission score: starts at 100 and is docked for each day late
 * (as the teacher set it) and for each unchecked item in the submission
 * checklist.
 *
 * Shared by the submit flow and the teacher's grade-modal prefill so the two
 * never drift apart.
 */
export const UNCHECKED_PENALTY = 5;

export interface LatePolicy {
  /** Points off for each day late. */
  perDay: number;
  /** The most a submission can lose for lateness, however late. */
  max: number;
}

export const DEFAULT_LATE_POLICY: LatePolicy = { perDay: 2, max: 20 };

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChecklistItem {
  id?: string;
  text?: string;
  checked?: boolean;
}

/**
 * How many days late a submission is, a started day counting as a whole one.
 * A submission marked late with no deadline passed (the teacher marked it so)
 * counts as one day.
 */
export function daysLate(isLate: boolean, submittedAt: Date, deadline: Date | null): number {
  if (!isLate) return 0;
  if (!deadline) return 1;
  return Math.max(1, Math.ceil((submittedAt.getTime() - deadline.getTime()) / DAY_MS));
}

export function computeSubmissionScore(lateDays: number, checklist?: unknown, policy: LatePolicy = DEFAULT_LATE_POLICY): number {
  const items: ChecklistItem[] = Array.isArray(checklist) ? checklist : [];
  const unchecked = items.filter((i) => i && i.checked === false).length;
  const latePenalty = Math.min(policy.max, lateDays * policy.perDay);
  return Math.max(0, 100 - latePenalty - unchecked * UNCHECKED_PENALTY);
}
