import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const tx = vi.hoisted(() => {
  const chain: any = { set: vi.fn(), exec: vi.fn() };
  chain.set.mockReturnValue(chain);
  return chain;
});

vi.mock('../../src/infrastructure/redis/connection', () => ({
  sharedConnection: { get: vi.fn(), set: vi.fn(), del: vi.fn(), multi: vi.fn(() => tx) },
}));

import { sharedConnection } from '../../src/infrastructure/redis/connection';
import {
  freeQuotaDayStart,
  nextFreeQuotaReset,
  freeTierExhaustedUntil,
  routeFreeTier,
  markFreeTierExhausted,
  markFreeTierAvailable,
  learnedFreeDailyLimit,
} from '../../src/services/gemini-quota';

const redis = sharedConnection as any;
const iso = (d: Date) => d.toISOString();

describe('gemini-quota - the free quota day (midnight Pacific)', () => {
  it('starts and ends the day at midnight Pacific daylight time (UTC-7)', () => {
    const now = new Date('2026-10-14T12:00:00Z'); // 05:00 in California
    expect(iso(freeQuotaDayStart(now))).toBe('2026-10-14T07:00:00.000Z');
    expect(iso(nextFreeQuotaReset(now))).toBe('2026-10-15T07:00:00.000Z');
  });

  it('still counts the evening before Pacific midnight as the previous day', () => {
    const now = new Date('2026-10-14T06:30:00Z'); // 23:30 on Oct 13 in California
    expect(iso(freeQuotaDayStart(now))).toBe('2026-10-13T07:00:00.000Z');
    expect(iso(nextFreeQuotaReset(now))).toBe('2026-10-14T07:00:00.000Z');
  });

  it('uses standard time (UTC-8) in winter', () => {
    const now = new Date('2026-12-10T12:00:00Z');
    expect(iso(freeQuotaDayStart(now))).toBe('2026-12-10T08:00:00.000Z');
    expect(iso(nextFreeQuotaReset(now))).toBe('2026-12-11T08:00:00.000Z');
  });

  it('rolls over months and years', () => {
    expect(iso(nextFreeQuotaReset(new Date('2026-10-31T12:00:00Z')))).toBe('2026-11-01T07:00:00.000Z');
    expect(iso(nextFreeQuotaReset(new Date('2026-12-31T12:00:00Z')))).toBe('2027-01-01T08:00:00.000Z');
  });

  it('spans 25 hours on the day daylight saving ends', () => {
    const now = new Date('2026-11-01T12:00:00Z'); // Nov 1 2026, clocks fell back at 02:00
    expect(iso(freeQuotaDayStart(now))).toBe('2026-11-01T07:00:00.000Z');
    expect(iso(nextFreeQuotaReset(now))).toBe('2026-11-02T08:00:00.000Z');
  });

  it('spans 23 hours on the day daylight saving starts', () => {
    const now = new Date('2026-03-08T12:00:00Z'); // Mar 8 2026, clocks sprang forward at 02:00
    expect(iso(freeQuotaDayStart(now))).toBe('2026-03-08T08:00:00.000Z');
    expect(iso(nextFreeQuotaReset(now))).toBe('2026-03-09T07:00:00.000Z');
  });
});

describe('gemini-quota - free-tier state in Redis', () => {
  const RESET = '2026-10-15T07:00:00.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
    tx.set.mockReturnValue(tx);
    tx.exec.mockResolvedValue([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('routeFreeTier', () => {
    it('sends calls to the free key while its quota is not marked spent', async () => {
      redis.get.mockResolvedValue(null);
      expect(await routeFreeTier()).toBe('free');
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('lets one call per half hour recheck a spent free tier', async () => {
      redis.get.mockResolvedValue(RESET);
      redis.set.mockResolvedValue('OK');
      expect(await routeFreeTier()).toBe('recheck');
      expect(redis.set).toHaveBeenCalledWith('gemini:free-recheck-wait', '1', 'PX', 30 * 60_000, 'NX');
    });

    it('sends the other calls straight to the paid key', async () => {
      redis.get.mockResolvedValue(RESET);
      redis.set.mockResolvedValue(null);
      expect(await routeFreeTier()).toBe('paid');
    });

    it('tries the free key when Redis fails', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await routeFreeTier()).toBe('free');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
    });

    it('tries the free key when Redis does not answer within a second', async () => {
      redis.get.mockReturnValue(new Promise(() => {}));
      const route = routeFreeTier();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await route).toBe('free');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    });

    it('rechecks when the free tier is spent but the recheck claim fails', async () => {
      redis.get.mockResolvedValue(RESET);
      redis.set.mockRejectedValue(new Error('READONLY'));
      expect(await routeFreeTier()).toBe('recheck');
    });
  });

  describe('markFreeTierExhausted', () => {
    it('marks the free tier spent until the reset and remembers the daily limit', async () => {
      const until = await markFreeTierExhausted(20);

      expect(iso(until)).toBe(RESET);
      expect(tx.set).toHaveBeenCalledWith('gemini:free-exhausted-until', RESET, 'PX', 19 * 3_600_000);
      expect(tx.set).toHaveBeenCalledWith('gemini:free-recheck-wait', '1', 'PX', 30 * 60_000);
      expect(tx.set).toHaveBeenCalledWith('gemini:free-daily-limit', '20', 'EX', 30 * 24 * 60 * 60);
      expect(tx.exec).toHaveBeenCalled();
    });

    it('keeps the last known limit when Google did not name one', async () => {
      await markFreeTierExhausted();
      expect(tx.set).toHaveBeenCalledTimes(2);
      expect(tx.set).not.toHaveBeenCalledWith('gemini:free-daily-limit', expect.anything(), 'EX', expect.anything());
    });

    it('does not hold a recheck past the reset', async () => {
      vi.setSystemTime(new Date('2026-10-15T06:50:00Z')); // 10 minutes before the reset
      await markFreeTierExhausted();
      expect(tx.set).toHaveBeenCalledWith('gemini:free-recheck-wait', '1', 'PX', 10 * 60_000);
    });

    it('still returns the reset time when Redis fails', async () => {
      tx.exec.mockRejectedValue(new Error('ECONNREFUSED'));
      expect(iso(await markFreeTierExhausted(20))).toBe(RESET);
    });
  });

  it('markFreeTierAvailable clears the spent mark and the recheck wait', async () => {
    redis.del.mockResolvedValue(2);
    await markFreeTierAvailable();
    expect(redis.del).toHaveBeenCalledWith('gemini:free-exhausted-until', 'gemini:free-recheck-wait');
  });

  it('freeTierExhaustedUntil reads the reset time, or null while quota remains', async () => {
    redis.get.mockResolvedValueOnce(RESET).mockResolvedValueOnce(null);
    expect(iso((await freeTierExhaustedUntil())!)).toBe(RESET);
    expect(await freeTierExhaustedUntil()).toBeNull();
  });

  it.each([
    ['20', 20],
    [null, null],
    ['0', null],
    ['not a number', null],
  ])('learnedFreeDailyLimit reads %j as %j', async (stored, expected) => {
    redis.get.mockResolvedValue(stored);
    expect(await learnedFreeDailyLimit()).toBe(expected);
  });
});
