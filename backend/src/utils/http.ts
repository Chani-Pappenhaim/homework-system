import { Response } from 'express';

// Shown to the client for any server-side fault (5xx). It must never reveal the
// real cause — DB errors, missing API keys, stack traces and the like are for
// the logs, not the user.
export const GENERIC_SERVER_ERROR =
  'אירעה שגיאה בשרת. אנא נסו שוב מאוחר יותר, ואם הבעיה חוזרת פנו למנהל המערכת.';

/**
 * Single place that turns a thrown error into a JSON error response.
 *
 * - 4xx (client errors we raised on purpose — "not found", "email exists",
 *   "wrong password"…) keep their message: it is meaningful and safe.
 * - 5xx / anything unexpected returns GENERIC_SERVER_ERROR and logs the real
 *   error, so internal details never reach the client.
 */
export function sendError(res: Response, err: any, fallbackStatus = 500): void {
  const status = typeof err?.status === 'number' ? err.status : fallbackStatus;
  const isClientError = status >= 400 && status < 500;

  if (!isClientError) {
    console.error('[error]', err);
  }

  const message =
    isClientError && typeof err?.message === 'string' && err.message
      ? err.message
      : GENERIC_SERVER_ERROR;

  res.status(status).json({ success: false, error: message });
}
