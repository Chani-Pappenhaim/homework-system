import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { aiUsageLog: { create: vi.fn() } },
}));

import { prisma } from '../../src/config/prisma';
import { reviewCode } from '../../src/services/gemini.service';

const p = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('gemini.service.reviewCode', () => {
  it('parses the Gemini JSON response and logs usage/cost', async () => {
    const geminiJson = JSON.stringify({ code_review: '• fix', verbal_review: 'good work', score: 85 });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: geminiJson }] } }],
        usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    p.aiUsageLog.create.mockResolvedValue({});

    const r = await reviewCode('const x=1', 'Task', 'be strict');
    expect(r).toEqual({ codeReview: '• fix', verbalReview: 'good work', score: 85 });
    // cost = 1M/1M*0.10 + 1M/1M*0.40 = 0.5
    expect(p.aiUsageLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'homework_review', costUsd: expect.closeTo(0.5, 5) }),
    }));
  });

  it('throws when the Gemini API responds not-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'boom',
    }));
    await expect(reviewCode('x', 'T')).rejects.toThrow(/Gemini API error: 500/);
  });

  it('defaults missing fields to empty/0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: {} }),
    }));
    p.aiUsageLog.create.mockResolvedValue({});
    const r = await reviewCode('x', 'T');
    expect(r).toEqual({ codeReview: '', verbalReview: '', score: 0 });
  });
});
