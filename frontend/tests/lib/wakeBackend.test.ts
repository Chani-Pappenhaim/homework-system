import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let wakeBackend: typeof import('@/lib/wakeBackend').wakeBackend;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  // Fresh module state (awake time, pending wake-up) for every test.
  vi.resetModules();
  ({ wakeBackend } = await import('@/lib/wakeBackend'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = { ok: true } as Response;
const unavailable = { ok: false } as Response;

describe('wakeBackend', () => {
  it('keeps polling /health until the backend answers', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(ok);
    const done = wakeBackend();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/health$/);
  });

  it('lets callers that arrive meanwhile share the same wake-up', async () => {
    fetchMock.mockResolvedValueOnce(unavailable).mockResolvedValueOnce(ok);
    const a = wakeBackend();
    const b = wakeBackend();
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips the check right after an answer, but checks again once it may have slept', async () => {
    fetchMock.mockResolvedValue(ok);
    await wakeBackend();
    await wakeBackend();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6 * 60_000);
    await wakeBackend();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up at the deadline instead of blocking the caller forever', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    let settled = false;
    const done = wakeBackend().then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(119_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    expect(settled).toBe(true);
  });
});
