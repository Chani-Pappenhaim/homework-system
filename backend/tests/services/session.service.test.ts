import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from '../../src/config/prisma';
import {
  isSessionCurrent, revokeAllSessions, touchLastSeen, getOnlineStudents, resetSessionCache, ONLINE_WINDOW_MS,
} from '../../src/services/session.service';

const p = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  resetSessionCache();
  p.user.update.mockResolvedValue({ tokenVersion: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session.service.isSessionCurrent', () => {
  it('accepts a token signed at the user\'s current version', async () => {
    p.user.findUnique.mockResolvedValue({ tokenVersion: 3 });
    expect(await isSessionCurrent('u1', 3)).toBe(true);
  });

  it('rejects a token signed before the version was bumped', async () => {
    p.user.findUnique.mockResolvedValue({ tokenVersion: 4 });
    expect(await isSessionCurrent('u1', 3)).toBe(false);
  });

  it('treats a token without a version as version 0, so tokens from before a deploy keep working', async () => {
    p.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    expect(await isSessionCurrent('u1', undefined)).toBe(true);
  });

  it('rejects a user that no longer exists', async () => {
    p.user.findUnique.mockResolvedValue(null);
    expect(await isSessionCurrent('gone', 0)).toBe(false);
  });

  it('reuses a recent matching answer instead of reading the database again', async () => {
    p.user.findUnique.mockResolvedValue({ tokenVersion: 2 });
    await isSessionCurrent('u1', 2);
    await isSessionCurrent('u1', 2);
    expect(p.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('reads the database again once the cached answer is old', async () => {
    vi.useFakeTimers();
    p.user.findUnique.mockResolvedValue({ tokenVersion: 2 });
    await isSessionCurrent('u1', 2);
    vi.advanceTimersByTime(31_000);
    await isSessionCurrent('u1', 2);
    expect(p.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('re-reads on a version the cache does not know, so a renewed session works at once', async () => {
    p.user.findUnique.mockResolvedValueOnce({ tokenVersion: 1 }).mockResolvedValueOnce({ tokenVersion: 2 });
    expect(await isSessionCurrent('u1', 1)).toBe(true);
    expect(await isSessionCurrent('u1', 2)).toBe(true);
  });
});

describe('session.service.revokeAllSessions', () => {
  it('bumps the version and turns away older tokens at once, without a database read', async () => {
    p.user.findUnique.mockResolvedValue({ tokenVersion: 0 });
    expect(await isSessionCurrent('u1', 0)).toBe(true);
    p.user.update.mockResolvedValue({ tokenVersion: 1 });

    expect(await revokeAllSessions('u1')).toBe(1);
    expect(p.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' }, data: { tokenVersion: { increment: 1 } }, select: { tokenVersion: true },
    });

    p.user.findUnique.mockResolvedValue({ tokenVersion: 1 });
    p.user.findUnique.mockClear();
    expect(await isSessionCurrent('u1', 1)).toBe(true);
    expect(p.user.findUnique).not.toHaveBeenCalled();
    expect(await isSessionCurrent('u1', 0)).toBe(false);
  });
});

describe('session.service.touchLastSeen', () => {
  it('writes the time of the first request', () => {
    touchLastSeen('u1', 1_000_000);
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { lastSeenAt: new Date(1_000_000) } });
  });

  it('skips writes within the throttle window and writes again after it', () => {
    touchLastSeen('u1', 0);
    touchLastSeen('u1', 60_000);
    touchLastSeen('u1', 119_999);
    expect(p.user.update).toHaveBeenCalledTimes(1);
    touchLastSeen('u1', 120_000);
    expect(p.user.update).toHaveBeenCalledTimes(2);
  });

  it('throttles each user on their own', () => {
    touchLastSeen('u1', 0);
    touchLastSeen('u2', 0);
    expect(p.user.update).toHaveBeenCalledTimes(2);
  });

  it('never throws when the write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    p.user.update.mockRejectedValue(new Error('db down'));
    expect(() => touchLastSeen('u1', 0)).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(error).toHaveBeenCalled();
  });
});

describe('session.service.getOnlineStudents', () => {
  it('counts the students seen within the online window', async () => {
    const now = Date.UTC(2026, 9, 31, 12, 0);
    const students = [{ id: 's1', name: 'רחל', lastSeenAt: new Date(now - 60_000) }];
    p.user.findMany.mockResolvedValue(students);

    expect(await getOnlineStudents(now)).toEqual({ count: 1, windowMinutes: 5, students });
    expect(p.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'STUDENT', lastSeenAt: { gte: new Date(now - ONLINE_WINDOW_MS) } },
    }));
  });
});
