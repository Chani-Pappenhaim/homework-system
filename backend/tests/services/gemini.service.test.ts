import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { aiUsageLog: { create: vi.fn() } },
}));

import { prisma } from '../../src/config/prisma';
import { reviewCode, generateQuiz } from '../../src/services/gemini.service';

/** A Gemini 200 response carrying `text` as the single candidate part. */
function geminiOk(text: string, usage: Record<string, number> = {}) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: usage,
    }),
  };
}

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

describe('gemini.service — failure reporting', () => {
  // Every case here used to reach the caller as an unreadable throw, which the
  // UI showed as an endless "generating" spinner. The message must name the cause.
  it('names the retired model on a 404 so the fix is obvious', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({
        error: { code: 404, message: 'This model models/gemini-2.0-flash is no longer available.' },
      }),
    }));
    await expect(generateQuiz('content')).rejects.toThrow(/404 — the model .* is not available/);
  });

  it('unwraps Google\'s error message instead of dumping the raw body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'API key not valid' } }),
    }));
    await expect(generateQuiz('content')).rejects.toThrow(/Gemini API error: 400 API key not valid/);
  });

  it('reports an unreachable API (DNS/TLS) rather than a bare fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unable to get local issuer certificate')));
    await expect(generateQuiz('content')).rejects.toThrow(/Cannot reach the Gemini API: unable to get local issuer certificate/);
  });

  it('unwraps the cause chain that node\'s "fetch failed" hides', async () => {
    // This is exactly what undici throws for an untrusted TLS chain: a useless
    // top-level message with the real reason one level down.
    const cause: any = new Error('unable to get local issuer certificate');
    cause.code = 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY';
    const wrapper: any = new TypeError('fetch failed');
    wrapper.cause = cause;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(wrapper));

    await expect(generateQuiz('content')).rejects.toThrow(
      /fetch failed ← unable to get local issuer certificate \[UNABLE_TO_GET_ISSUER_CERT_LOCALLY\]/,
    );
  });

  it('reports a timeout distinctly from an unreachable host', async () => {
    const timeout: any = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    await expect(generateQuiz('content')).rejects.toThrow(/Gemini API timed out after \d+ms/);
  });

  it('reports an empty 200 response with its finishReason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }], usageMetadata: {} }),
    }));
    p.aiUsageLog.create.mockResolvedValue({});
    await expect(generateQuiz('content')).rejects.toThrow(/no content \(finishReason: MAX_TOKENS\)/);
  });

  it('reports malformed JSON instead of throwing a raw SyntaxError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk('here are your questions: [')));
    p.aiUsageLog.create.mockResolvedValue({});
    await expect(generateQuiz('content')).rejects.toThrow(/malformed JSON/);
  });

  it('throws when GEMINI_API_KEY is not configured', async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(generateQuiz('content')).rejects.toThrow(/GEMINI_API_KEY is not configured/);
    } finally {
      process.env.GEMINI_API_KEY = saved;
    }
  });
});

describe('gemini.service.generateQuiz', () => {
  const q = (i: number) => ({
    id: String(i), question: `Q${i}?`, options: ['a', 'b', 'c', 'd'], correctIndex: 1,
  });

  beforeEach(() => p.aiUsageLog.create.mockResolvedValue({}));

  it('returns the questions and logs usage as quiz_generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      geminiOk(JSON.stringify([q(1), q(2)]), { promptTokenCount: 100, candidatesTokenCount: 200 }),
    ));
    const r = await generateQuiz('לולאות בפייתון');
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ id: '1', question: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 1 });
    expect(p.aiUsageLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'quiz_generation' }),
    }));
  });

  it('accepts the object-wrapped shape Gemini sometimes returns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk(JSON.stringify({ questions: [q(1)] }))));
    expect(await generateQuiz('x')).toHaveLength(1);
  });

  it('drops questions that would break scoring', async () => {
    const broken = [
      q(1),
      { id: '2', question: 'no options', options: [], correctIndex: 0 },
      { id: '3', question: 'index out of range', options: ['a', 'b'], correctIndex: 7 },
      { id: '4', question: '', options: ['a', 'b'], correctIndex: 0 },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk(JSON.stringify(broken))));
    const r = await generateQuiz('x');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('1');
  });

  it('throws when nothing usable came back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk(JSON.stringify([{ question: 'x' }]))));
    await expect(generateQuiz('x')).rejects.toThrow(/no usable questions/);
  });

  it('throws on an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk('[]')));
    await expect(generateQuiz('x')).rejects.toThrow(/no questions/);
  });
});
