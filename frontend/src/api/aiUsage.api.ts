import api from './axios';

export interface AiUsageMonth {
  month: string; // "YYYY-MM"
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
