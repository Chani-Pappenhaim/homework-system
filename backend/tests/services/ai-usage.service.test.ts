import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { aiUsageLog: { findMany: vi.fn() } },
}));
vi.mock('../../src/infrastructure/redis/connection', () => ({ sharedConnection: {} }));
// Only the Redis-backed state is faked; the quota-day arithmetic stays real.
vi.mock('../../src/services/gemini-quota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/gemini-quota')>()),
  freeTierExhaustedUntil: vi.fn(),
  learnedFreeDailyLimit: vi.fn(),
}));

import { prisma } from '../../src/config/prisma';
import * as quota from '../../src/services/gemini-quota';
import { getSummary } from '../../src/services/ai-usage.service';

const p = prisma as any;
const q = quota as any;

beforeEach(() => {
  vi.clearAllMocks();
  q.freeTierExhaustedUntil.mockResolvedValue(null);
  q.learnedFreeDailyLimit.mockResolvedValue(null);
});

describe('ai-usage.service.getSummary', () => {
  it('returns all-zero totals and 12 month buckets when there are no logs', async () => {
    p.aiUsageLog.findMany.mockResolvedValue([]);
    const s = await getSummary();
    expect(s.totalReviews).toBe(0);
    expect(s.totalQuizzes).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.free).toEqual({ calls: 0, tokensInput: 0, tokensOutput: 0, costUsd: 0 });
    expect(s.paid).toEqual({ calls: 0, tokensInput: 0, tokensOutput: 0, costUsd: 0 });
    expect(s.byMonth).toHaveLength(12);
    // newest month first
    expect(s.byMonth[0]).toMatchObject({ reviews: 0, quizzes: 0, paidCalls: 0, costUsd: 0 });
  });

  it('aggregates reviews vs quizzes, tokens and cost, per tier', async () => {
    const now = new Date();
    p.aiUsageLog.findMany.mockResolvedValue([
      { type: 'homework_review', tier: 'FREE', tokensInput: 100, tokensOutput: 50, costUsd: 0, createdAt: now },
      { type: 'homework_review', tier: 'PAID', tokensInput: 200, tokensOutput: 20, costUsd: 0.02, createdAt: now },
      { type: 'quiz_generation', tier: 'PAID', tokensInput: 10, tokensOutput: 5, costUsd: 0.005, createdAt: now },
    ]);
    const s = await getSummary();
    expect(s.totalReviews).toBe(2);
    expect(s.totalQuizzes).toBe(1);
    expect(s.totalTokensInput).toBe(310);
    expect(s.totalTokensOutput).toBe(75);
    expect(s.totalCostUsd).toBeCloseTo(0.025, 5);
    expect(s.free).toEqual({ calls: 1, tokensInput: 100, tokensOutput: 50, costUsd: 0 });
    expect(s.paid).toMatchObject({ calls: 2, tokensInput: 210, tokensOutput: 25 });
    expect(s.paid.costUsd).toBeCloseTo(0.025, 5);
    // current month bucket reflects the counts
    expect(s.byMonth[0]).toMatchObject({ reviews: 2, quizzes: 1, paidCalls: 2 });
    expect(s.byMonth[0].costUsd).toBeCloseTo(0.025, 5);
  });

  it('ignores logs older than the 12-month window for buckets but still totals them', async () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 5);
    p.aiUsageLog.findMany.mockResolvedValue([
      { type: 'homework_review', tier: 'PAID', tokensInput: 1, tokensOutput: 1, costUsd: 1, createdAt: old },
    ]);
    const s = await getSummary();
    expect(s.totalReviews).toBe(1);
    expect(s.totalCostUsd).toBe(1);
    // no bucket should have picked it up
    expect(s.byMonth.every((m) => m.reviews === 0 && m.paidCalls === 0)).toBe(true);
  });
});

describe('ai-usage.service.getSummary - free-tier quota', () => {
  const savedPaidKey = process.env.GEMINI_API_KEY_PAID;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z')); // 05:00 in California
    p.aiUsageLog.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.GEMINI_FREE_DAILY_LIMIT;
    if (savedPaidKey === undefined) delete process.env.GEMINI_API_KEY_PAID;
    else process.env.GEMINI_API_KEY_PAID = savedPaidKey;
  });

  it('counts free calls since midnight Pacific, not paid calls or earlier ones', async () => {
    const log = (tier: string, at: string) =>
      ({ type: 'homework_review', tier, tokensInput: 1, tokensOutput: 1, costUsd: 0, createdAt: new Date(at) });
    p.aiUsageLog.findMany.mockResolvedValue([
      log('FREE', '2026-10-14T07:00:00Z'), // the reset itself
      log('FREE', '2026-10-14T11:59:00Z'),
      log('FREE', '2026-10-14T06:59:00Z'), // 23:59 the day before in California
      log('PAID', '2026-10-14T09:00:00Z'),
    ]);
    const s = await getSummary();
    expect(s.quota.freeRequestsToday).toBe(2);
    expect(s.quota.resetsAt).toBe('2026-10-15T07:00:00.000Z');
  });

  it('reports which keys are configured and whether the free quota is spent', async () => {
    process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
    q.freeTierExhaustedUntil.mockResolvedValue(new Date('2026-10-15T07:00:00Z'));
    const s = await getSummary();
    expect(s.quota).toMatchObject({
      freeKeyConfigured: true,
      paidKeyConfigured: true,
      freeExhaustedUntil: '2026-10-15T07:00:00.000Z',
    });
  });

  it('reports a spent quota as null while quota remains, and no paid key when unset', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    const s = await getSummary();
    expect(s.quota).toMatchObject({ paidKeyConfigured: false, freeExhaustedUntil: null });
  });

  it('takes the daily limit from GEMINI_FREE_DAILY_LIMIT before the one Google reported', async () => {
    q.learnedFreeDailyLimit.mockResolvedValue(20);
    expect((await getSummary()).quota.freeDailyLimit).toBe(20);

    process.env.GEMINI_FREE_DAILY_LIMIT = '250';
    expect((await getSummary()).quota.freeDailyLimit).toBe(250);

    process.env.GEMINI_FREE_DAILY_LIMIT = 'lots';
    expect((await getSummary()).quota.freeDailyLimit).toBe(20);
  });

  it('leaves the daily limit unknown until either source has it', async () => {
    expect((await getSummary()).quota.freeDailyLimit).toBeNull();
  });
});
