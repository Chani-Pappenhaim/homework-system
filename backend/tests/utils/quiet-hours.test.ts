import { describe, it, expect } from 'vitest';
import {
  releaseTime, quietDelayMs, israelTimeToInstant, isValidMinuteOfDay, DEFAULT_QUIET_HOURS, type QuietHours,
} from '../../src/utils/quiet-hours';

const iso = (d: Date) => d.toISOString();
const MIN = 60 * 1000;

// Israel is UTC+2 in winter and UTC+3 in summer; in 2026 summer time runs from
// Friday 27 March 02:00 to Sunday 25 October 02:00.
describe('releaseTime - the default window (00:00 until 10:00)', () => {
  const quiet = DEFAULT_QUIET_HOURS;

  it('holds a notification created just after midnight until 10:00 the same morning', () => {
    const now = new Date('2026-10-31T22:00:00Z'); // 00:00 on 1 Nov, UTC+2
    expect(iso(releaseTime(now, quiet))).toBe('2026-11-01T08:00:00.000Z');
  });

  it('holds a notification created at 03:17 until 10:00', () => {
    const now = new Date('2026-11-01T01:17:00Z');
    expect(iso(releaseTime(now, quiet))).toBe('2026-11-01T08:00:00.000Z');
  });

  it('holds a notification one minute before the release time', () => {
    const now = new Date('2026-11-01T07:59:00Z'); // 09:59
    expect(quietDelayMs(now, quiet)).toBe(MIN);
  });

  it('sends a notification created exactly at the release time at once', () => {
    const now = new Date('2026-11-01T08:00:00Z'); // 10:00
    expect(releaseTime(now, quiet)).toBe(now);
    expect(quietDelayMs(now, quiet)).toBe(0);
  });

  it('sends a notification created at 23:59 at once', () => {
    const now = new Date('2026-10-31T21:59:00Z'); // 23:59 on 31 Oct
    expect(quietDelayMs(now, quiet)).toBe(0);
  });

  it('holds a notification created exactly at midnight', () => {
    const now = new Date('2026-10-31T22:00:00Z');
    expect(quietDelayMs(now, quiet)).toBe(10 * 60 * MIN);
  });

  it('uses summer time (UTC+3) in the summer', () => {
    const now = new Date('2026-08-01T21:00:00Z'); // 00:00 on 2 Aug
    expect(iso(releaseTime(now, quiet))).toBe('2026-08-02T07:00:00.000Z');
  });
});

describe('releaseTime - clock changes', () => {
  it('releases at 10:00 local on the day summer time ends, which is a 25-hour day', () => {
    const now = new Date('2026-10-24T21:30:00Z'); // 00:30 on 25 Oct, still UTC+3
    expect(iso(releaseTime(now, DEFAULT_QUIET_HOURS))).toBe('2026-10-25T08:00:00.000Z'); // 10:00 UTC+2
  });

  it('releases at 10:00 local on the day summer time starts, which is a 23-hour day', () => {
    const now = new Date('2026-03-26T22:30:00Z'); // 00:30 on 27 Mar, still UTC+2
    expect(iso(releaseTime(now, DEFAULT_QUIET_HOURS))).toBe('2026-03-27T07:00:00.000Z'); // 10:00 UTC+3
  });

  it('moves a release time skipped by the spring change to just after the gap', () => {
    const quiet: QuietHours = { startMinute: 0, releaseMinute: 2 * 60 + 30 };
    const now = new Date('2026-03-26T22:00:00Z'); // 00:00 on 27 Mar
    expect(iso(releaseTime(now, quiet))).toBe('2026-03-27T00:30:00.000Z'); // 03:30 UTC+3
  });

  it('takes the later occurrence of a release time repeated by the autumn change', () => {
    const quiet: QuietHours = { startMinute: 0, releaseMinute: 90 };
    const now = new Date('2026-10-24T21:00:00Z'); // 00:00 on 25 Oct
    expect(iso(releaseTime(now, quiet))).toBe('2026-10-24T23:30:00.000Z'); // 01:30 UTC+2
  });
});

describe('releaseTime - other windows', () => {
  const evening: QuietHours = { startMinute: 22 * 60, releaseMinute: 7 * 60 }; // 22:00 until 07:00

  it('holds an evening notification until the next morning', () => {
    const now = new Date('2026-11-01T20:30:00Z'); // 22:30
    expect(iso(releaseTime(now, evening))).toBe('2026-11-02T05:00:00.000Z');
  });

  it('holds an after-midnight notification until the same morning', () => {
    const now = new Date('2026-11-01T22:30:00Z'); // 00:30 on 2 Nov
    expect(iso(releaseTime(now, evening))).toBe('2026-11-02T05:00:00.000Z');
  });

  it('opens the window exactly at its start minute', () => {
    expect(quietDelayMs(new Date('2026-11-01T19:59:00Z'), evening)).toBe(0); // 21:59
    expect(quietDelayMs(new Date('2026-11-01T20:00:00Z'), evening)).toBeGreaterThan(0); // 22:00
  });

  it('closes the window exactly at its release minute', () => {
    expect(quietDelayMs(new Date('2026-11-02T05:00:00Z'), evening)).toBe(0); // 07:00
  });

  it('carries a window that ends in the next month over the month end', () => {
    const now = new Date('2026-10-31T20:30:00Z'); // 22:30 on 31 Oct
    expect(iso(releaseTime(now, evening))).toBe('2026-11-01T05:00:00.000Z');
  });

  it('handles a window inside one day', () => {
    const noon: QuietHours = { startMinute: 12 * 60, releaseMinute: 14 * 60 };
    expect(iso(releaseTime(new Date('2026-11-01T11:00:00Z'), noon))).toBe('2026-11-01T12:00:00.000Z'); // 13:00 -> 14:00
    expect(quietDelayMs(new Date('2026-11-01T12:00:00Z'), noon)).toBe(0); // 14:00
  });

  it('is off when the start and release times are equal', () => {
    const off: QuietHours = { startMinute: 600, releaseMinute: 600 };
    const now = new Date('2026-11-01T01:00:00Z');
    expect(releaseTime(now, off)).toBe(now);
  });
});

describe('israelTimeToInstant', () => {
  it('converts winter and summer wall times', () => {
    expect(iso(israelTimeToInstant(2026, 1, 15, 600))).toBe('2026-01-15T08:00:00.000Z');
    expect(iso(israelTimeToInstant(2026, 7, 15, 600))).toBe('2026-07-15T07:00:00.000Z');
  });
});

describe('isValidMinuteOfDay', () => {
  it.each([[0], [600], [1439]])('accepts %s', (v) => expect(isValidMinuteOfDay(v)).toBe(true));
  it.each([[-1], [1440], [1.5], ['600'], [null], [undefined], [NaN]])('rejects %s', (v) => expect(isValidMinuteOfDay(v)).toBe(false));
});
