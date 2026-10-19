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
    console.warn('[settings] could not read the AI settings - using the defaults:', (err as Error)?.message ?? err);
    return DEFAULT_AI_SETTINGS;
  }
}

export const MAX_SENDER_NAME = 70;

export interface EmailSettings {
  /** The name the teacher chose, or null for the site's default. */
  senderName: string | null;
  /** The site's default (BREVO_SENDER_NAME), shown while she has chosen none. */
  defaultSenderName: string;
}

function defaultSenderName(): string {
  return process.env.BREVO_SENDER_NAME || process.env.BREVO_SENDER_EMAIL || '';
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { senderName: row?.emailSenderName ?? null, defaultSenderName: defaultSenderName() };
}

/** An empty name goes back to the site's default. */
export async function updateEmailSettings(input: { senderName?: unknown }): Promise<EmailSettings> {
  if (input?.senderName !== null && typeof input?.senderName !== 'string') {
    throw new AppError('Invalid senderName', 'שם השולח אינו תקין', 400);
  }
  // One line: a line break has no place in a sender name.
  const name = (input.senderName ?? '').replace(/\s+/g, ' ').trim();
  if (name.length > MAX_SENDER_NAME) {
    throw new AppError('Sender name too long', `שם השולח ארוך מדי (עד ${MAX_SENDER_NAME} תווים)`, 400);
  }
  const emailSenderName = name || null;
  await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, emailSenderName },
    update: { emailSenderName },
  });
  return { senderName: emailSenderName, defaultSenderName: defaultSenderName() };
}

/** The name emails are sent from. A failed read uses the default, so mail still goes out. */
export async function emailSenderName(): Promise<string> {
  try {
    return (await getEmailSettings()).senderName ?? defaultSenderName();
  } catch (err) {
    console.warn('[settings] could not read the email sender name - using the default:', (err as Error)?.message ?? err);
    return defaultSenderName();
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
