import type { AiPaidFallback } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { DEFAULT_LATE_POLICY, type LatePolicy } from '../utils/grading';
import { DEFAULT_QUIET_HOURS, isValidMinuteOfDay, type QuietHours } from '../utils/quiet-hours';

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
export const MAX_SITE_NAME = 60;

export interface SiteNames {
  brandName: string;
  teacherName: string;
}

export const DEFAULT_SITE_NAMES: SiteNames = { brandName: 'Teacher Feature', teacherName: 'המורה עדי שלום' };

/** The site's names: the teacher's choice, else the defaults. A failed read uses the defaults. */
export async function getSiteNames(): Promise<SiteNames> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      brandName: row?.siteBrandName || DEFAULT_SITE_NAMES.brandName,
      teacherName: row?.siteTeacherName || DEFAULT_SITE_NAMES.teacherName,
    };
  } catch (err) {
    console.warn('[settings] could not read the site names - using the defaults:', (err as Error)?.message ?? err);
    return DEFAULT_SITE_NAMES;
  }
}

function siteName(value: unknown, hebrew: string): string | null {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throw new AppError('Invalid site name', `${hebrew} אינו תקין`, 400);
  }
  // One line: a line break has no place in a name.
  const name = (value ?? '').replace(/\s+/g, ' ').trim();
  if (name.length > MAX_SITE_NAME) {
    throw new AppError('Site name too long', `${hebrew} ארוך מדי (עד ${MAX_SITE_NAME} תווים)`, 400);
  }
  return name || null;
}

/** An empty name goes back to its default. */
export async function updateSiteNames(input: { brandName?: unknown; teacherName?: unknown }): Promise<SiteNames> {
  const siteBrandName = siteName(input?.brandName, 'שם האתר');
  const siteTeacherName = siteName(input?.teacherName, 'שם המורה');
  const data = { siteBrandName, siteTeacherName };
  await prisma.appSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  return {
    brandName: siteBrandName ?? DEFAULT_SITE_NAMES.brandName,
    teacherName: siteTeacherName ?? DEFAULT_SITE_NAMES.teacherName,
  };
}

export interface EmailSettings {
  /** The name the teacher chose, or null for the site's default. */
  senderName: string | null;
  /** The site's default (BREVO_SENDER_NAME), shown while she has chosen none. */
  defaultSenderName: string;
}

/** The site's default sender: built from the site names once the teacher customized them, else the env value. */
function defaultSenderName(row?: { siteBrandName: string | null; siteTeacherName: string | null } | null): string {
  if (row && (row.siteBrandName || row.siteTeacherName)) {
    return `${row.siteBrandName ?? DEFAULT_SITE_NAMES.brandName} - ${row.siteTeacherName ?? DEFAULT_SITE_NAMES.teacherName}`;
  }
  return process.env.BREVO_SENDER_NAME || process.env.BREVO_SENDER_EMAIL || '';
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { senderName: row?.emailSenderName ?? null, defaultSenderName: defaultSenderName(row) };
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
  const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { senderName: emailSenderName, defaultSenderName: defaultSenderName(row) };
}

/** The name emails are sent from. A failed read uses the default, so mail still goes out. */
export async function emailSenderName(): Promise<string> {
  try {
    const settings = await getEmailSettings();
    return settings.senderName ?? settings.defaultSenderName;
  } catch (err) {
    console.warn('[settings] could not read the email sender name - using the default:', (err as Error)?.message ?? err);
    return defaultSenderName();
  }
}

/**
 * The teacher's late penalty: the defaults until she first saves it. A failed
 * read falls back to the defaults too, so a submission is never lost over it.
 */
export async function getLatePolicy(): Promise<LatePolicy> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? { perDay: row.latePenaltyPerDay, max: row.latePenaltyMax } : DEFAULT_LATE_POLICY;
  } catch (err) {
    console.warn('[settings] could not read the late penalty - using the defaults:', (err as Error)?.message ?? err);
    return DEFAULT_LATE_POLICY;
  }
}

function penaltyPoints(value: unknown, field: string, hebrew: string): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100) {
    throw new AppError(`Invalid ${field}: ${String(value)}`, `${hebrew} צריך להיות מספר שלם בין 0 ל-100`, 400);
  }
  return n;
}

export async function updateLatePolicy(input: { perDay?: unknown; max?: unknown }): Promise<LatePolicy> {
  const perDay = penaltyPoints(input?.perDay, 'perDay', 'מספר הנקודות ליום איחור');
  const max = penaltyPoints(input?.max, 'max', 'ההורדה המקסימלית');
  const data = { latePenaltyPerDay: perDay, latePenaltyMax: max };
  await prisma.appSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  return { perDay, max };
}

/**
 * The hours in which students' notification emails are held back: the defaults
 * until the teacher first saves them. A failed read falls back to the defaults.
 */
export async function getQuietHours(): Promise<QuietHours> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? { startMinute: row.quietStartMinute, releaseMinute: row.releaseMinute } : DEFAULT_QUIET_HOURS;
  } catch (err) {
    console.warn('[settings] could not read the quiet hours - using the defaults:', (err as Error)?.message ?? err);
    return DEFAULT_QUIET_HOURS;
  }
}

export async function updateQuietHours(input: { startMinute?: unknown; releaseMinute?: unknown }): Promise<QuietHours> {
  const { startMinute, releaseMinute } = input ?? {};
  if (!isValidMinuteOfDay(startMinute) || !isValidMinuteOfDay(releaseMinute)) {
    throw new AppError('Invalid quiet hours', 'שעות השקט צריכות להיות שעות ביממה', 400);
  }
  const data = { quietStartMinute: startMinute, releaseMinute };
  await prisma.appSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  return { startMinute, releaseMinute };
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
