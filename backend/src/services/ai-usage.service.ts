import { prisma } from '../config/prisma';
import { cloudinary } from '../config/cloudinary';

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
  costUsd: number;
}

export interface AiUsageSummary {
  totalReviews: number;
  totalQuizzes: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  byMonth: MonthBucket[];
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function getSummary(): Promise<AiUsageSummary> {
  const logs = await prisma.aiUsageLog.findMany({
    select: { type: true, tokensInput: true, tokensOutput: true, costUsd: true, createdAt: true },
  });

  // Build the last 12 months as ordered buckets, newest first
  const now = new Date();
  const buckets = new Map<string, MonthBucket>();
  const order: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    order.push(key);
    buckets.set(key, { month: key, reviews: 0, quizzes: 0, costUsd: 0 });
  }

  let totalReviews = 0;
  let totalQuizzes = 0;
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let totalCostUsd = 0;

  for (const log of logs) {
    const isQuiz = log.type.includes('quiz');
    if (isQuiz) totalQuizzes++;
    else totalReviews++;
    totalTokensInput += log.tokensInput;
    totalTokensOutput += log.tokensOutput;
    totalCostUsd += log.costUsd;

    const bucket = buckets.get(monthKey(log.createdAt));
    if (bucket) {
      if (isQuiz) bucket.quizzes++;
      else bucket.reviews++;
      bucket.costUsd += log.costUsd;
    }
  }

  return {
    totalReviews,
    totalQuizzes,
    totalTokensInput,
    totalTokensOutput,
    totalCostUsd,
    byMonth: order.map((key) => buckets.get(key)!),
  };
}
