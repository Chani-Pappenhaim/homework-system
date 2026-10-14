import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { aiUsageLog: { create: vi.fn() } },
}));
// The free-tier state lives in Redis; each test sets where calls are routed.
vi.mock('../../src/services/gemini-quota', () => ({
  routeFreeTier: vi.fn(),
  markFreeTierExhausted: vi.fn(),
  markFreeTierAvailable: vi.fn(),
}));
vi.mock('../../src/services/settings.service', () => ({ getAiSettings: vi.fn() }));

import { prisma } from '../../src/config/prisma';
import * as quota from '../../src/services/gemini-quota';
import * as settings from '../../src/services/settings.service';
import { reviewCode, generateQuiz, GeminiError, paidCallCostUsd } from '../../src/services/gemini.service';

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
const q = quota as any;
const setPaidFallback = (paidFallback: string) =>
  (settings.getAiSettings as any).mockResolvedValue({ paidFallback });

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  setPaidFallback('DAILY_QUOTA');
});

describe('gemini.service.reviewCode', () => {
  it('parses the Gemini JSON response and logs a free-tier call at no cost', async () => {
    const geminiJson = JSON.stringify({ code_review: '• fix', verbal_review: 'good work', score: 85 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      geminiOk(geminiJson, { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 }),
    ));
    p.aiUsageLog.create.mockResolvedValue({});

    const r = await reviewCode('const x=1', 'Task', 'be strict');
    expect(r).toEqual({ codeReview: '• fix', verbalReview: 'good work', score: 85 });
    // Thinking tokens count as output.
    expect(p.aiUsageLog.create).toHaveBeenCalledWith({
      data: { type: 'homework_review', tier: 'FREE', tokensInput: 100, tokensOutput: 50, costUsd: 0 },
    });
  });

  it('throws when the Gemini API responds not-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'boom',
    }));
    await expect(reviewCode('x', 'T')).rejects.toThrow(/Gemini API error \(FREE key\): 500/);
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
    await expect(generateQuiz('content')).rejects.toThrow(/Gemini API error \(FREE key\): 400 API key not valid/);
  });

  it('reports an unreachable API (DNS/TLS) rather than a bare fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unable to get local issuer certificate')));
    await expect(generateQuiz('content')).rejects.toThrow(/Cannot reach the Gemini API after [\d.]+s: unable to get local issuer certificate/);
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

describe('gemini.service.generateQuiz — attached files', () => {
  const q = { id: '1', question: 'Q?', options: ['a', 'b'], correctIndex: 0 };
  beforeEach(() => p.aiUsageLog.create.mockResolvedValue({}));

  it('sends each PDF or image as a file part, named, after the lesson text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk(JSON.stringify([q])));
    vi.stubGlobal('fetch', fetchMock);
    await generateQuiz('תוכן השיעור', [{ name: 'notes.pdf', mimeType: 'application/pdf', data: 'QUJD' }]);
    const parts = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts;
    expect(parts).toEqual([
      { text: expect.stringContaining('תוכן השיעור') },
      { text: 'קובץ מצורף: notes.pdf' },
      { inline_data: { mime_type: 'application/pdf', data: 'QUJD' } },
    ]);
  });

  it('sends the lesson text alone when nothing is attached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk(JSON.stringify([q])));
    vi.stubGlobal('fetch', fetchMock);
    await generateQuiz('x');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts).toHaveLength(1);
  });

  it('keeps the HTTP status on the error, so a refused file can be told apart', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Unable to process input image' } }),
    }));
    const err = await generateQuiz('x').catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err).toMatchObject({ status: 400, kind: 'config', retryable: false });
  });

  it('marks a rate limit as worth retrying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '' }));
    expect(await generateQuiz('x').catch((e) => e)).toMatchObject({ status: 429, kind: 'rate-limit', retryable: true });
  });
});

describe('gemini.service — free and paid keys', () => {
  /** Google's 429 body: the spent quota is named in a QuotaFailure violation. */
  const quotaExceeded = (quotaId: string, quotaValue = '20') => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'You exceeded your current quota, please check your plan and billing details.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId, quotaValue }],
          },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '33s' },
        ],
      },
    }),
  });
  const DAILY = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier';
  const PER_MINUTE = 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier';
  const answer = () => geminiOk(JSON.stringify({ code_review: '', verbal_review: '', score: 90 }), {
    promptTokenCount: 1_000_000, candidatesTokenCount: 600_000, thoughtsTokenCount: 400_000,
  });
  const keysUsed = (fetchMock: any) =>
    fetchMock.mock.calls.map((call: any[]) => new URL(call[0]).searchParams.get('key'));
  const savedFreeKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
    p.aiUsageLog.create.mockResolvedValue({});
    q.routeFreeTier.mockResolvedValue('free');
    q.markFreeTierExhausted.mockResolvedValue(new Date('2026-10-15T07:00:00Z'));
    q.markFreeTierAvailable.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.GEMINI_API_KEY_PAID;
    process.env.GEMINI_API_KEY = savedFreeKey;
  });

  it('serves calls from the free key while it has quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer());
    vi.stubGlobal('fetch', fetchMock);
    await reviewCode('x', 'T');
    expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
    expect(p.aiUsageLog.create.mock.calls[0][0].data).toMatchObject({ tier: 'FREE', costUsd: 0 });
  });

  it('retries on the paid key at once when the free daily quota is spent, and bills it', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(quotaExceeded(DAILY, '20')).mockResolvedValueOnce(answer());
    vi.stubGlobal('fetch', fetchMock);

    await reviewCode('x', 'T');

    expect(keysUsed(fetchMock)).toEqual(['test-gemini-key', 'test-paid-key']);
    expect(q.markFreeTierExhausted).toHaveBeenCalledWith(20);
    expect(p.aiUsageLog.create).toHaveBeenCalledWith({
      data: {
        type: 'homework_review',
        tier: 'PAID',
        tokensInput: 1_000_000,
        tokensOutput: 1_000_000,
        costUsd: expect.closeTo(paidCallCostUsd(1_000_000, 1_000_000), 6),
      },
    });
  });

  it('goes straight to the paid key while the free tier is marked spent', async () => {
    q.routeFreeTier.mockResolvedValue('paid');
    const fetchMock = vi.fn().mockResolvedValue(answer());
    vi.stubGlobal('fetch', fetchMock);
    await reviewCode('x', 'T');
    expect(keysUsed(fetchMock)).toEqual(['test-paid-key']);
  });

  it('returns to the free key when a recheck finds it answering again', async () => {
    q.routeFreeTier.mockResolvedValue('recheck');
    const fetchMock = vi.fn().mockResolvedValue(answer());
    vi.stubGlobal('fetch', fetchMock);
    await reviewCode('x', 'T');
    expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
    expect(q.markFreeTierAvailable).toHaveBeenCalled();
    expect(p.aiUsageLog.create.mock.calls[0][0].data.tier).toBe('FREE');
  });

  it('stays on the paid key when a recheck finds the free quota still spent', async () => {
    q.routeFreeTier.mockResolvedValue('recheck');
    const fetchMock = vi.fn().mockResolvedValueOnce(quotaExceeded(DAILY)).mockResolvedValueOnce(answer());
    vi.stubGlobal('fetch', fetchMock);
    await reviewCode('x', 'T');
    expect(keysUsed(fetchMock)).toEqual(['test-gemini-key', 'test-paid-key']);
    expect(q.markFreeTierExhausted).toHaveBeenCalled();
    expect(q.markFreeTierAvailable).not.toHaveBeenCalled();
  });

  it('leaves a per-minute limit on the free key, for the queue to retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(quotaExceeded(PER_MINUTE, '10'));
    vi.stubGlobal('fetch', fetchMock);
    const err = await reviewCode('x', 'T').catch((e) => e);
    expect(err).toMatchObject({ status: 429, kind: 'rate-limit', retryable: true });
    expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
    expect(q.markFreeTierExhausted).not.toHaveBeenCalled();
  });

  it('leaves an outage on the free key too', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'overloaded' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'unavailable', retryable: true });
    expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
  });

  it('fails a spent daily quota for good when no paid key is configured', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    const fetchMock = vi.fn().mockResolvedValue(quotaExceeded(DAILY, '20'));
    vi.stubGlobal('fetch', fetchMock);
    const err = await reviewCode('x', 'T').catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err).toMatchObject({ status: 429, kind: 'daily-quota', retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Recorded anyway, so the usage report can show the quota is spent.
    expect(q.markFreeTierExhausted).toHaveBeenCalledWith(20);
  });

  it('spots the daily quota in a body it cannot parse', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => `quota GenerateRequestsPerDayPerProjectPerModel-FreeTier exceeded`,
    }));
    expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'daily-quota' });
    expect(q.markFreeTierExhausted).toHaveBeenCalledWith(undefined);
  });

  it('does not ask Google again while the free tier is marked spent and no paid key is configured', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    q.routeFreeTier.mockResolvedValue('paid');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'daily-quota', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the paid key alone when it is the only one configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue(answer());
    vi.stubGlobal('fetch', fetchMock);
    await reviewCode('x', 'T');
    expect(keysUsed(fetchMock)).toEqual(['test-paid-key']);
    expect(q.routeFreeTier).not.toHaveBeenCalled();
    expect(p.aiUsageLog.create.mock.calls[0][0].data.tier).toBe('PAID');
  });

  it('says so when the paid project ran out of prepaid credit', async () => {
    q.routeFreeTier.mockResolvedValue('paid');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => '{}' }));
    const err = await reviewCode('x', 'T').catch((e) => e);
    expect(err).toMatchObject({ status: 402, kind: 'config', retryable: false });
    expect(err.message).toMatch(/PAID key.*prepaid credit/);
  });

  describe('when the teacher never allows the paid key', () => {
    beforeEach(() => setPaidFallback('NEVER'));

    it('fails a spent daily quota for good instead of moving to the paid key', async () => {
      const fetchMock = vi.fn().mockResolvedValue(quotaExceeded(DAILY, '20'));
      vi.stubGlobal('fetch', fetchMock);
      expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'daily-quota', retryable: false });
      expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
      expect(q.markFreeTierExhausted).toHaveBeenCalledWith(20);
    });

    it('stops the calls without asking Google while the free tier is marked spent', async () => {
      q.routeFreeTier.mockResolvedValue('paid');
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'daily-quota' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still lets a recheck try the free key', async () => {
      q.routeFreeTier.mockResolvedValue('recheck');
      const fetchMock = vi.fn().mockResolvedValue(answer());
      vi.stubGlobal('fetch', fetchMock);
      await reviewCode('x', 'T');
      expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
      expect(q.markFreeTierAvailable).toHaveBeenCalled();
    });

    it('treats a paid key that is the only one configured as no key at all', async () => {
      delete process.env.GEMINI_API_KEY;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const err = await reviewCode('x', 'T').catch((e) => e);
      expect(err).toMatchObject({ kind: 'config', retryable: false });
      expect(err.message).toMatch(/forbid the paid key/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('when the teacher allows the paid key on any limit', () => {
    beforeEach(() => setPaidFallback('ANY_LIMIT'));

    it('moves a call that hit a per-minute limit to the paid key, without marking the free tier spent', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(quotaExceeded(PER_MINUTE, '10')).mockResolvedValueOnce(answer());
      vi.stubGlobal('fetch', fetchMock);
      await reviewCode('x', 'T');
      expect(keysUsed(fetchMock)).toEqual(['test-gemini-key', 'test-paid-key']);
      expect(q.markFreeTierExhausted).not.toHaveBeenCalled();
      expect(p.aiUsageLog.create.mock.calls[0][0].data.tier).toBe('PAID');
    });

    it('moves a call that met an outage of the free key to the paid key', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'overloaded' })
        .mockResolvedValueOnce(answer());
      vi.stubGlobal('fetch', fetchMock);
      await reviewCode('x', 'T');
      expect(keysUsed(fetchMock)).toEqual(['test-gemini-key', 'test-paid-key']);
    });

    it('still moves a spent daily quota to the paid key and marks it', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(quotaExceeded(DAILY, '20')).mockResolvedValueOnce(answer());
      vi.stubGlobal('fetch', fetchMock);
      await reviewCode('x', 'T');
      expect(keysUsed(fetchMock)).toEqual(['test-gemini-key', 'test-paid-key']);
      expect(q.markFreeTierExhausted).toHaveBeenCalledWith(20);
    });

    it('does not retry a request the free key rejected as invalid', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{}' });
      vi.stubGlobal('fetch', fetchMock);
      expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'config' });
      expect(keysUsed(fetchMock)).toEqual(['test-gemini-key']);
    });

    it('leaves a per-minute limit on the free key when no paid key is configured', async () => {
      delete process.env.GEMINI_API_KEY_PAID;
      const fetchMock = vi.fn().mockResolvedValue(quotaExceeded(PER_MINUTE, '10'));
      vi.stubGlobal('fetch', fetchMock);
      expect(await reviewCode('x', 'T').catch((e) => e)).toMatchObject({ kind: 'rate-limit', retryable: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('gemini.service.paidCallCostUsd', () => {
  afterEach(() => {
    delete process.env.GEMINI_PRICE_INPUT_PER_1M;
    delete process.env.GEMINI_PRICE_OUTPUT_PER_1M;
  });

  it('prices by the list in force on the day of the call', () => {
    expect(paidCallCostUsd(1_000_000, 1_000_000, new Date('2026-10-14T12:00:00Z'))).toBeCloseTo(0.75 + 3.75, 6);
    expect(paidCallCostUsd(1_000_000, 1_000_000, new Date('2027-01-01T00:00:00Z'))).toBeCloseTo(1.5 + 7.5, 6);
  });

  it('lets GEMINI_PRICE_*_PER_1M override the list, but not when left empty', () => {
    process.env.GEMINI_PRICE_INPUT_PER_1M = '0.10';
    process.env.GEMINI_PRICE_OUTPUT_PER_1M = '';
    expect(paidCallCostUsd(1_000_000, 1_000_000, new Date('2026-10-14T12:00:00Z'))).toBeCloseTo(0.1 + 3.75, 6);
  });
});
