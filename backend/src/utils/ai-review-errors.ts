import { UnrecoverableError } from 'bullmq';
import { GeminiError } from '../services/gemini.service';

// Shown when the review failed for a reason the student can't fix (Gemini down,
// GitHub rate limit, a bug). The technical cause goes to the logs only.
export const AI_REVIEW_GENERIC_ERROR =
  'בדיקת ה-AI לא הצליחה בגלל תקלה זמנית. אפשר לבקש בדיקה שוב בעוד כמה דקות, ואם זה חוזר — כדאי לפנות למורה.';

// Shown when the AI's daily quota is spent: retrying minutes later cannot help.
export const AI_REVIEW_DAILY_QUOTA_ERROR =
  'שירות ה-AI הגיע למכסת השימוש היומית שלו. אפשר לבקש בדיקה שוב מחר, אחרי 10:00 בבוקר.';

/**
 * A review failure caused by the submission itself (missing repo, no code,
 * unsupported type). Extends UnrecoverableError so BullMQ fails the job at once
 * instead of retrying something that can't succeed.
 */
export class AiReviewInputError extends UnrecoverableError {
  constructor(message: string, readonly clientMessage: string) {
    super(message);
    this.name = 'AiReviewInputError';
  }
}

export function aiReviewClientMessage(err: unknown): string {
  if (err instanceof AiReviewInputError) return err.clientMessage;
  if (err instanceof GeminiError && err.kind === 'daily-quota') return AI_REVIEW_DAILY_QUOTA_ERROR;
  return AI_REVIEW_GENERIC_ERROR;
}
