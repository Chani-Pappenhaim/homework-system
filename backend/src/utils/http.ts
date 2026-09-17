import { Response } from 'express';

// Shown to the client for any server-side fault. Never reveals the real cause —
// DB errors, missing API keys, stack traces and the like stay in the logs.
export const GENERIC_SERVER_ERROR =
  'אירעה שגיאה בשרת. אנא נסו שוב מאוחר יותר, ואם הבעיה חוזרת פנו למנהל המערכת.';

/**
 * Turns a thrown error into a JSON error response.
 *
 * - `AppError` carries a Hebrew `clientMessage` meant for display, separate
 *   from its (English) `message` used for logs/debugging — that message is
 *   always logged so the real cause stays visible to developers.
 * - Anything else that's a 4xx keeps its raw `message` (legacy call sites not
 *   yet migrated to `AppError`).
 * - 5xx / anything unexpected returns GENERIC_SERVER_ERROR and logs the real
 *   error, so internal details never reach the client.
 */
export function sendError(res: Response, err: any, fallbackStatus = 500): void {
  const status = typeof err?.status === 'number' ? err.status : fallbackStatus;
  const isClientError = status >= 400 && status < 500;

  if (isClientError) {
    console.error('[client-error]', err.message ?? err);
  } else {
    console.error('[error]', err);
  }

  const message =
    isClientError && typeof err?.clientMessage === 'string' && err.clientMessage
      ? err.clientMessage
      : isClientError && typeof err?.message === 'string' && err.message
        ? err.message
        : GENERIC_SERVER_ERROR;

  res.status(status).json({ success: false, error: message });
}
