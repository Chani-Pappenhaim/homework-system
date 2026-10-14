import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';
import {
  freeQuotaDayStart,
  freeTierExhaustedUntil,
  learnedFreeDailyLimit,
  nextFreeQuotaReset,
} from './gemini-quota';
import { getAiSettings } from './settings.service';
import type { AiPaidFallback } from '@prisma/client';

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percent: number;
}

/**
 * Returns current storage usage from the Cloudinary account.
 *
 * Cloudinary's `usage()` response reports storage bytes under `storage.usage`
 * (not `used_bytes`), and current (credit-based) plans don't report a
 * storage-specific `storage.limit` at all — only a unified `credits.limit`
 * shared across storage/bandwidth/transformations. 1 credit ≈ 1 GB storage,
 * so we approximate the storage limit from the credits quota when a plan
 * doesn't expose one directly.
 */
export async function getStorageUsage(): Promise<StorageUsage> {
  const usage = await cloudinary.api.usage();
  const usedBytes = usage.storage?.usage ?? usage.storage?.used_bytes ?? 0;
  const BYTES_PER_CREDIT = 1024 ** 3; // 1 credit ≈ 1 GB
  const limitBytes = usage.storage?.limit ?? (usage.credits?.limit ? usage.credits.limit * BYTES_PER_CREDIT : 0);
  const percent = usage.credits?.used_percent ?? (limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0);
  return { usedBytes, limitBytes, percent };
}

interface MonthBucket {
  month: string;
  reviews: number;
  quizzes: number;
  /** Calls the paid key answered — the only ones that cost money. */
  paidCalls: number;
  costUsd: number;
}

/** Calls, tokens and billed cost of one Gemini tier. */
export interface TierUsage {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

/**
 * Today's standing against the free tier. It caps requests per day and per
 * minute, never total tokens, so requests are what "used out of" counts.
 */
export interface GeminiQuotaStatus {
  freeKeyConfigured: boolean;
  paidKeyConfigured: boolean;
  /** The teacher's setting for when calls may move to the paid key. */
  paidFallback: AiPaidFallback;
  /** Free-tier calls answered since the quota last reset. */
  freeRequestsToday: number;
  /** Free requests allowed per day: GEMINI_FREE_DAILY_LIMIT, else what Google reported. */
  freeDailyLimit: number | null;
  /** ISO time of the next daily reset (midnight Pacific). */
  resetsAt: string;
  /** ISO time the spent free quota resets, while it is spent. */
  freeExhaustedUntil: string | null;
}

export interface AiUsageSummary {
  totalReviews: number;
  totalQuizzes: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  /** Amount billed, all of it on the paid tier. */
  totalCostUsd: number;
  free: TierUsage;
  paid: TierUsage;
  quota: GeminiQuotaStatus;
  byMonth: MonthBucket[];
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function configuredDailyLimit(): number | null {
  const value = Number(process.env.GEMINI_FREE_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function getSummary(): Promise<AiUsageSummary> {
  const [logs, exhaustedUntil, learnedLimit, settings] = await Promise.all([
    prisma.aiUsageLog.findMany({
      select: { type: true, tier: true, tokensInput: true, tokensOutput: true, costUsd: true, createdAt: true },
    }),
    freeTierExhaustedUntil(),
    learnedFreeDailyLimit(),
    getAiSettings(),
  ]);

  // Build the last 12 months as ordered buckets, newest first
  const now = new Date();
  const buckets = new Map<string, MonthBucket>();
  const order: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    order.push(key);
    buckets.set(key, { month: key, reviews: 0, quizzes: 0, paidCalls: 0, costUsd: 0 });
  }

  const emptyTier = (): TierUsage => ({ calls: 0, tokensInput: 0, tokensOutput: 0, costUsd: 0 });
  const tiers = { FREE: emptyTier(), PAID: emptyTier() };
  const quotaDayStart = freeQuotaDayStart(now);
  let freeRequestsToday = 0;
  let totalReviews = 0;
  let totalQuizzes = 0;

  for (const log of logs) {
    const isQuiz = log.type.includes('quiz');
    if (isQuiz) totalQuizzes++;
    else totalReviews++;

    const tier = tiers[log.tier];
    tier.calls++;
    tier.tokensInput += log.tokensInput;
    tier.tokensOutput += log.tokensOutput;
    tier.costUsd += log.costUsd;
    if (log.tier === 'FREE' && log.createdAt >= quotaDayStart) freeRequestsToday++;

    const bucket = buckets.get(monthKey(log.createdAt));
    if (bucket) {
      if (isQuiz) bucket.quizzes++;
      else bucket.reviews++;
      if (log.tier === 'PAID') bucket.paidCalls++;
      bucket.costUsd += log.costUsd;
    }
  }

  return {
    totalReviews,
    totalQuizzes,
    totalTokensInput: tiers.FREE.tokensInput + tiers.PAID.tokensInput,
    totalTokensOutput: tiers.FREE.tokensOutput + tiers.PAID.tokensOutput,
    totalCostUsd: tiers.FREE.costUsd + tiers.PAID.costUsd,
    free: tiers.FREE,
    paid: tiers.PAID,
    quota: {
      freeKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
      paidKeyConfigured: Boolean(process.env.GEMINI_API_KEY_PAID),
      paidFallback: settings.paidFallback,
      freeRequestsToday,
      freeDailyLimit: configuredDailyLimit() ?? learnedLimit,
      resetsAt: nextFreeQuotaReset(now).toISOString(),
      freeExhaustedUntil: exhaustedUntil?.toISOString() ?? null,
    },
    byMonth: order.map((key) => buckets.get(key)!),
  };
}
