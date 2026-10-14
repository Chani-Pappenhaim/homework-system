import api from './axios';

export interface AiUsageMonth {
  month: string; // "YYYY-MM"
  reviews: number;
  quizzes: number;
  /** Calls the paid key answered. */
  paidCalls: number;
  costUsd: number;
}

/** Calls, tokens and billed cost of one Gemini tier. */
export interface AiTierUsage {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

/**
 * When AI calls may move from the free key to the paid one:
 * DAILY_QUOTA — only once the free daily quota is spent;
 * ANY_LIMIT — also on a per-minute limit or an outage of the free key;
 * NEVER — never; AI actions stop until the free quota resets.
 */
export type AiPaidFallback = 'DAILY_QUOTA' | 'ANY_LIMIT' | 'NEVER';

/** Today's standing against the free tier's daily request quota. */
export interface GeminiQuotaStatus {
  freeKeyConfigured: boolean;
  paidKeyConfigured: boolean;
  paidFallback: AiPaidFallback;
  freeRequestsToday: number;
  /** null until known (set in the server env, or reported by Google). */
  freeDailyLimit: number | null;
  /** ISO time of the next daily reset. */
  resetsAt: string;
  /** ISO time the spent free quota resets, while it is spent. */
  freeExhaustedUntil: string | null;
}

export interface AiUsageSummary {
  totalReviews: number;
  totalQuizzes: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  /** Amount billed — paid-tier calls only. */
  totalCostUsd: number;
  free: AiTierUsage;
  paid: AiTierUsage;
  quota: GeminiQuotaStatus;
  byMonth: AiUsageMonth[];
}

/** Whether an AI action can run now; the buttons that start one follow it. */
export interface AiAvailability {
  available: boolean;
  reason: 'not-configured' | 'daily-quota' | null;
  /** ISO time the free daily quota resets, while the spent quota is what stops the AI. */
  resumesAt: string | null;
}

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percent: number;
}

export const aiUsageApi = {
  summary: () =>
    api.get<{ success: true; data: AiUsageSummary }>('/ai-usage/summary'),
  storage: () =>
    api.get<{ success: true; data: StorageUsage }>('/ai-usage/storage'),
  availability: () =>
    api.get<{ success: true; data: AiAvailability }>('/ai-usage/availability'),
  updateSettings: (settings: { paidFallback: AiPaidFallback }) =>
    api.put<{ success: true; data: { paidFallback: AiPaidFallback } }>('/ai-usage/settings', settings),
};
