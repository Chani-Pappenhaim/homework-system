import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/gemini-quota', () => ({ freeTierExhaustedUntil: vi.fn() }));
vi.mock('../../src/services/settings.service', () => ({ getAiSettings: vi.fn() }));

import { freeTierExhaustedUntil } from '../../src/services/gemini-quota';
import { getAiSettings } from '../../src/services/settings.service';
import { aiAvailability, assertAiAvailable, resumeTimeInIsrael } from '../../src/services/ai-availability';

const exhaustedUntil = freeTierExhaustedUntil as any;
const settings = getAiSettings as any;
const RESET = new Date('2026-10-15T07:00:00Z'); // 10:00 in Israel
const savedFreeKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_API_KEY_PAID = 'test-paid-key';
  settings.mockResolvedValue({ paidFallback: 'DAILY_QUOTA' });
  exhaustedUntil.mockResolvedValue(null);
});
afterEach(() => {
  process.env.GEMINI_API_KEY = savedFreeKey;
  delete process.env.GEMINI_API_KEY_PAID;
});

describe('ai-availability.aiAvailability', () => {
  it('is available while the free tier has quota left', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    expect(await aiAvailability()).toEqual({ available: true, reason: null, resumesAt: null });
  });

  it('stays available on the paid key after the free quota is spent', async () => {
    exhaustedUntil.mockResolvedValue(RESET);
    expect(await aiAvailability()).toMatchObject({ available: true });
  });

  it('stops once the free quota is spent and no paid key is configured', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    exhaustedUntil.mockResolvedValue(RESET);
    expect(await aiAvailability()).toEqual({
      available: false, reason: 'daily-quota', resumesAt: RESET.toISOString(),
    });
  });

  it('stops once the free quota is spent when the teacher never allows the paid key', async () => {
    settings.mockResolvedValue({ paidFallback: 'NEVER' });
    exhaustedUntil.mockResolvedValue(RESET);
    expect(await aiAvailability()).toMatchObject({ available: false, reason: 'daily-quota' });
  });

  it('is not configured without a key it may use', async () => {
    delete process.env.GEMINI_API_KEY;
    settings.mockResolvedValue({ paidFallback: 'NEVER' });
    expect(await aiAvailability()).toEqual({ available: false, reason: 'not-configured', resumesAt: null });
    delete process.env.GEMINI_API_KEY_PAID;
    settings.mockResolvedValue({ paidFallback: 'DAILY_QUOTA' });
    expect(await aiAvailability()).toMatchObject({ reason: 'not-configured' });
  });
});

describe('ai-availability.assertAiAvailable', () => {
  it('lets an available action through', async () => {
    await expect(assertAiAvailable()).resolves.toBeUndefined();
  });

  it('refuses with a 503 that says when the quota resets', async () => {
    delete process.env.GEMINI_API_KEY_PAID;
    exhaustedUntil.mockResolvedValue(RESET);
    await expect(assertAiAvailable()).rejects.toMatchObject({
      status: 503,
      clientMessage: expect.stringContaining('10:00'),
    });
  });

  it('refuses with a 503 when no key may be used', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_PAID;
    await expect(assertAiAvailable()).rejects.toMatchObject({ status: 503, clientMessage: 'שירות ה-AI אינו זמין כרגע.' });
  });
});

describe('ai-availability.resumeTimeInIsrael', () => {
  it('names tomorrow when the reset falls on the next Israeli day', () => {
    expect(resumeTimeInIsrael(RESET, new Date('2026-10-14T12:00:00Z'))).toBe('מחר אחרי 10:00');
  });

  it('names today when the reset is later the same Israeli day', () => {
    expect(resumeTimeInIsrael(RESET, new Date('2026-10-15T05:00:00Z'))).toBe('היום אחרי 10:00');
  });

  it('follows Israel winter time', () => {
    // 08:00 UTC = midnight Pacific standard time = 10:00 Israel standard time.
    expect(resumeTimeInIsrael(new Date('2026-12-02T08:00:00Z'), new Date('2026-12-01T20:00:00Z'))).toBe('מחר אחרי 10:00');
  });
});
