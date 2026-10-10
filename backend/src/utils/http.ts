import { Response } from 'express';

// Shown to the client for any server-side fault. Never reveals the real cause —
// DB errors, missing API keys, stack traces and the like stay in the logs.
export const GENERIC_SERVER_ERROR =
  'אירעה שגיאה בשרת. אנא נסו שוב מאוחר יותר, ואם הבעיה חוזרת פנו למנהל המערכת.';

// Prisma "known request" errors that come from the request itself rather than
// from a server fault: a record that no longer exists, a reference to one that
// doesn't, or a duplicate of a unique value.
const PRISMA_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  P2025: { status: 404, message: 'הפריט המבוקש לא נמצא. ייתכן שנמחק — יש לרענן את הדף.' },
  P2003: { status: 400, message: 'הפריט שנבחר לא קיים יותר. יש לרענן את הדף ולנסות שוב.' },
  P2002: { status: 409, message: 'כבר קיים פריט עם אותם פרטים.' },
};

// Fallback text for a 4xx whose message wasn't written for the user.
const CLIENT_ERROR_BY_STATUS: Record<number, string> = {
  400: 'הבקשה אינה תקינה.',
  401: 'אינך מחובר. אנא התחברו מחדש.',
  403: 'אין לך הרשאה לבצע פעולה זו.',
  404: 'הפריט המבוקש לא נמצא.',
  409: 'הפעולה מתנגשת בשינוי אחר. יש לרענן את הדף ולנסות שוב.',
  413: 'הקובץ גדול מדי',
  429: 'יותר מדי בקשות. אנא נסו שוב בעוד כמה דקות.',
};

const HEBREW = /[֐-׿]/;

/**
 * Turns a thrown error into a JSON error response.
 *
 * - `AppError` carries a Hebrew `clientMessage` meant for display, separate
 *   from its (English) `message` used for logs/debugging — that message is
 *   always logged so the real cause stays visible to developers.
 * - A Prisma error caused by the request (missing record, broken reference,
 *   duplicate) becomes the matching 4xx instead of a server error.
 * - Any other 4xx keeps its raw `message` only when it is Hebrew (legacy call
 *   sites that throw display text directly); English developer text is
 *   replaced by a generic message for that status.
 * - A 5xx `AppError` (e.g. an upstream AI/queue outage) still shows its
 *   `clientMessage`: that text was written for the user on purpose.
 * - Any other 5xx / unexpected error returns GENERIC_SERVER_ERROR and logs the
 *   real error, so internal details never reach the client.
 */
export function sendError(res: Response, err: any, fallbackStatus = 500): void {
  const prisma = typeof err?.code === 'string' ? PRISMA_CLIENT_ERRORS[err.code] : undefined;
  const status = typeof err?.status === 'number' ? err.status : prisma ? prisma.status : fallbackStatus;
  const isClientError = status >= 400 && status < 500;

  if (isClientError) {
    console.error('[client-error]', err?.message ?? err);
  } else {
    console.error('[error]', err);
  }

  let message: string;
  if (typeof err?.clientMessage === 'string' && err.clientMessage) message = err.clientMessage;
  else if (!isClientError) message = GENERIC_SERVER_ERROR;
  else if (prisma && status === prisma.status) message = prisma.message;
  else if (typeof err?.message === 'string' && HEBREW.test(err.message)) message = err.message;
  else message = CLIENT_ERROR_BY_STATUS[status] ?? CLIENT_ERROR_BY_STATUS[400];

  res.status(status).json({ success: false, error: message });
}
