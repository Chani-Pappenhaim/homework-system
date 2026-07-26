/**
 * "ציון הגשה" (submission score) — the automatic score, per the business rules:
 * starts at 100 and is docked for lateness and for each requirement the student
 * left unchecked in her submission checklist.
 *
 * Shared by the submit flow (auto, visible to the student immediately) and the
 * teacher's grade-modal prefill so the two can never drift apart.
 */
export const LATE_PENALTY = 10;
export const UNCHECKED_PENALTY = 5;

export interface ChecklistItem {
  id?: string;
  text?: string;
  checked?: boolean;
}

export function computeSubmissionScore(isLate: boolean, checklist?: unknown): number {
  const items: ChecklistItem[] = Array.isArray(checklist) ? checklist : [];
  const unchecked = items.filter((i) => i && i.checked === false).length;
  return Math.max(0, 100 - (isLate ? LATE_PENALTY : 0) - unchecked * UNCHECKED_PENALTY);
}
