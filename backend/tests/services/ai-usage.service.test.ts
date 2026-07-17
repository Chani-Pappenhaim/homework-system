import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { aiUsageLog: { findMany: vi.fn() } },
}));

import { prisma } from '../../src/config/prisma';
import { getSummary } from '../../src/services/ai-usage.service';

const p = prisma as any;

beforeEach(() => vi.clearAllMocks());

describe('ai-usage.service.getSummary', () => {
  it('returns all-zero totals and 12 month buckets when there are no logs', async () => {
    p.aiUsageLog.findMany.mockResolvedValue([]);
    const s = await getSummary();
    expect(s.totalReviews).toBe(0);
    expect(s.totalQuizzes).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.byMonth).toHaveLength(12);
    // newest month first
    expect(s.byMonth[0].reviews).toBe(0);
  });

  it('aggregates reviews vs quizzes, tokens and cost', async () => {
    const now = new Date();
    p.aiUsageLog.findMany.mockResolvedValue([
      { type: 'homework_review', tokensInput: 100, tokensOutput: 50, costUsd: 0.01, createdAt: now },
      { type: 'homework_review', tokensInput: 200, tokensOutput: 20, costUsd: 0.02, createdAt: now },
      { type: 'quiz_generation', tokensInput: 10, tokensOutput: 5, costUsd: 0.005, createdAt: now },
    ]);
    const s = await getSummary();
    expect(s.totalReviews).toBe(2);
    expect(s.totalQuizzes).toBe(1);
    expect(s.totalTokensInput).toBe(310);
    expect(s.totalTokensOutput).toBe(75);
    expect(s.totalCostUsd).toBeCloseTo(0.035, 5);
    // current month bucket reflects the counts
    expect(s.byMonth[0].reviews).toBe(2);
    expect(s.byMonth[0].quizzes).toBe(1);
    expect(s.byMonth[0].costUsd).toBeCloseTo(0.035, 5);
  });

  it('ignores logs older than the 12-month window for buckets but still totals them', async () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 5);
    p.aiUsageLog.findMany.mockResolvedValue([
      { type: 'homework_review', tokensInput: 1, tokensOutput: 1, costUsd: 1, createdAt: old },
    ]);
    const s = await getSummary();
    expect(s.totalReviews).toBe(1);
    expect(s.totalCostUsd).toBe(1);
    // no bucket should have picked it up
    expect(s.byMonth.every((m) => m.reviews === 0)).toBe(true);
  });
});
