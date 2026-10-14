import { AppError } from '../utils/errors';
import { freeTierExhaustedUntil } from './gemini-quota';
import { getAiSettings } from './settings.service';

export type AiUnavailableReason = 'not-configured' | 'daily-quota';

export interface AiAvailability {
  available: boolean;
  reason: AiUnavailableReason | null;
  /** ISO time the free daily quota resets, while the spent quota is what stops the AI. */
  resumesAt: string | null;
}

const AVAILABLE: AiAvailability = { available: true, reason: null, resumesAt: null };

/**
 * Whether an AI action can run now: a key the settings allow, with quota left
 * on it. A paid key counts as having quota — a spent prepaid credit only shows
 * up as a 402 on the call itself.
 */
export async function aiAvailability(): Promise<AiAvailability> {
  const { paidFallback } = await getAiSettings();
  const paidKey = Boolean(process.env.GEMINI_API_KEY_PAID) && paidFallback !== 'NEVER';
  if (paidKey) return AVAILABLE;
  if (!process.env.GEMINI_API_KEY) return { available: false, reason: 'not-configured', resumesAt: null };
  const until = await freeTierExhaustedUntil();
  return until ? { available: false, reason: 'daily-quota', resumesAt: until.toISOString() } : AVAILABLE;
}

const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';

/** "היום אחרי 10:00" or "מחר אחרי 10:00", in Israel time. The reset is never further than a day away. */
export function resumeTimeInIsrael(resumesAt: Date, now = new Date()): string {
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ISRAEL_TIME_ZONE });
  const time = resumesAt.toLocaleTimeString('en-GB', {
    timeZone: ISRAEL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return `${day(resumesAt) === day(now) ? 'היום' : 'מחר'} אחרי ${time}`;
}

/**
 * Refuses an AI action that cannot run now, before it is queued — so a student
 * does not spend her review attempt on a call that is bound to fail.
 */
export async function assertAiAvailable(): Promise<void> {
  const status = await aiAvailability();
  if (status.available) return;
  if (status.reason === 'daily-quota' && status.resumesAt) {
    throw new AppError(
      'The free Gemini daily quota is spent and no paid key may be used',
      `המכסה היומית של ה-AI נגמרה. אפשר לנסות שוב ${resumeTimeInIsrael(new Date(status.resumesAt))}.`,
      503
    );
  }
  throw new AppError('No Gemini key may be used', 'שירות ה-AI אינו זמין כרגע.', 503);
}
