import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/session.service', () => ({
  isSessionCurrent: vi.fn(),
  touchLastSeen: vi.fn(),
}));

import { verifyAccessTokenMiddleware } from '../../src/middleware/auth';
import { isSessionCurrent, touchLastSeen } from '../../src/services/session.service';
import { signAccessToken } from '../../src/utils/jwt';

function run(token?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {}, baseUrl: '/api/x', path: '/' };
  const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
  const next = vi.fn();
  return { req, res, next, done: verifyAccessTokenMiddleware(req, res, next) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSessionCurrent).mockResolvedValue(true);
});

describe('verifyAccessTokenMiddleware', () => {
  it('lets a live session through and records the user as active', async () => {
    const { req, next, done } = run(signAccessToken({ userId: 'u1', role: 'STUDENT', tokenVersion: 2 }));
    await done;
    expect(isSessionCurrent).toHaveBeenCalledWith('u1', 2);
    expect(touchLastSeen).toHaveBeenCalledWith('u1');
    expect(req.user.userId).toBe('u1');
    expect(next).toHaveBeenCalledWith();
  });

  it('turns away a token of a session that was signed out', async () => {
    vi.mocked(isSessionCurrent).mockResolvedValue(false);
    const { res, next, done } = run(signAccessToken({ userId: 'u1', role: 'STUDENT', tokenVersion: 1 }));
    await done;
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(touchLastSeen).not.toHaveBeenCalled();
  });

  it('passes a database failure on instead of letting the request through', async () => {
    const failure = new Error('db down');
    vi.mocked(isSessionCurrent).mockRejectedValue(failure);
    const { res, next, done } = run(signAccessToken({ userId: 'u1', role: 'ADMIN' }));
    await done;
    expect(next).toHaveBeenCalledWith(failure);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a request without a token before any session lookup', async () => {
    const { res, done } = run();
    await done;
    expect(res.status).toHaveBeenCalledWith(401);
    expect(isSessionCurrent).not.toHaveBeenCalled();
  });

  it('rejects a forged token', async () => {
    const { res, done } = run('not-a-jwt');
    await done;
    expect(res.status).toHaveBeenCalledWith(401);
    expect(isSessionCurrent).not.toHaveBeenCalled();
  });
});
