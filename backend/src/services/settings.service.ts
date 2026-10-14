import type { AiPaidFallback } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';

// The single settings row.
const SETTINGS_ID = 'app';

export const AI_PAID_FALLBACKS: readonly AiPaidFallback[] = ['DAILY_QUOTA', 'ANY_LIMIT', 'NEVER'];

export interface AiSettings {
  /** When calls may move from the free Gemini key to the paid one. */
  paidFallback: AiPaidFallback;
}

const DEFAULT_AI_SETTINGS: AiSettings = { paidFallback: 'DAILY_QUOTA' };

/**
 * The teacher's AI settings: the defaults until she first saves them. A failed
 * read falls back to the defaults too, so a database hiccup cannot stop an AI
 * call that would otherwise go through.
 */
export async function getAiSettings(): Promise<AiSettings> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? { paidFallback: row.aiPaidFallback } : DEFAULT_AI_SETTINGS;
  } catch (err) {
    console.warn('[settings] could not read the AI settings — using the defaults:', (err as Error)?.message ?? err);
    return DEFAULT_AI_SETTINGS;
  }
}

export async function updateAiSettings(input: { paidFallback?: unknown }): Promise<AiSettings> {
  const paidFallback = input?.paidFallback as AiPaidFallback;
  if (!AI_PAID_FALLBACKS.includes(paidFallback)) {
    throw new AppError(`Invalid paidFallback: ${String(input?.paidFallback)}`, 'ההגדרה שנבחרה אינה חוקית', 400);
  }
  const row = await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, aiPaidFallback: paidFallback },
    update: { aiPaidFallback: paidFallback },
  });
  return { paidFallback: row.aiPaidFallback };
}
