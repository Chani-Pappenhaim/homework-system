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

/** Today's standing against the free tier's daily request quota. */
export interface GeminiQuotaStatus {
  freeKeyConfigured: boolean;
  paidKeyConfigured: boolean;
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
};
