import { describe, it, expect, vi, afterEach } from 'vitest';
import { isActiveHours, pingSelf, keepAwakeUrl } from '../../src/workers/keep-awake';

// Israel is UTC+3 in summer (IDT) and UTC+2 in winter (IST).
const summer = (iso: string) => new Date(`${iso}+03:00`);
const winter = (iso: string) => new Date(`${iso}+02:00`);

afterEach(() => vi.unstubAllGlobals());

describe('isActiveHours (Israel time)', () => {
  it('covers weekdays from 06:00 until 23:00', () => {
    expect(isActiveHours(summer('2026-10-15T05:59'))).toBe(false); // Thu
    expect(isActiveHours(summer('2026-10-15T06:00'))).toBe(true);
    expect(isActiveHours(summer('2026-10-15T14:33'))).toBe(true);
    expect(isActiveHours(summer('2026-10-15T22:59'))).toBe(true);
    expect(isActiveHours(summer('2026-10-15T23:00'))).toBe(false);
    expect(isActiveHours(summer('2026-10-11T12:00'))).toBe(true); // Sun
  });

  it('stops on Friday early enough to be asleep by 16:00', () => {
    expect(isActiveHours(summer('2026-10-16T15:29'))).toBe(true);
    expect(isActiveHours(summer('2026-10-16T15:30'))).toBe(false);
  });

  it('never pings during Shabbat and resumes at 20:30 on Saturday night', () => {
    expect(isActiveHours(summer('2026-10-17T00:30'))).toBe(false);
    expect(isActiveHours(summer('2026-10-17T12:00'))).toBe(false);
    expect(isActiveHours(summer('2026-10-17T20:29'))).toBe(false);
    expect(isActiveHours(summer('2026-10-17T20:30'))).toBe(true);
    expect(isActiveHours(summer('2026-10-17T23:00'))).toBe(false);
  });

  it('follows the local clock in winter time too', () => {
    expect(isActiveHours(winter('2026-12-10T06:00'))).toBe(true);  // Thu
    expect(isActiveHours(winter('2026-12-10T05:59'))).toBe(false);
    expect(isActiveHours(winter('2026-12-11T15:30'))).toBe(false); // Fri
  });
});

describe('pingSelf', () => {
  it("calls the service's own health URL during active hours", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    expect(await pingSelf('https://app.onrender.com/', summer('2026-10-15T10:00'))).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('https://app.onrender.com/api/health');
  });

  it('does nothing outside active hours, so the instance can sleep', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await pingSelf('https://app.onrender.com', summer('2026-10-17T12:00'))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('keepAwakeUrl', () => {
  it('is on only where Render provides the public URL', () => {
    expect(keepAwakeUrl({ RENDER_EXTERNAL_URL: 'https://app.onrender.com' })).toBe('https://app.onrender.com');
    expect(keepAwakeUrl({})).toBeNull();
    expect(keepAwakeUrl({ RENDER_EXTERNAL_URL: '  ' })).toBeNull();
  });
});
