import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every token signed here belongs to a live session.
vi.mock('../../src/services/session.service', () => ({
  isSessionCurrent: vi.fn(async () => true),
  touchLastSeen: vi.fn(),
}));
vi.mock('bullmq', () => {
  class Queue { add = vi.fn(async () => ({})); }
  class Worker { on = vi.fn(); }
  class QueueEvents { on = vi.fn(); }
  return { Queue, Worker, QueueEvents };
});
vi.mock('../../src/services/auth.service', () => ({
  getUserById: vi.fn(),
  toUserDTO: (u: any) => ({ id: u.id, avatarUrl: u.avatarUrl ?? null }),
}));
vi.mock('../../src/services/avatar.service', () => ({
  setAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}));

import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import { AppError } from '../../src/utils/errors';
import * as authService from '../../src/services/auth.service';
import * as avatarService from '../../src/services/avatar.service';

const app = createApp();
const token = signAccessToken({ userId: 'stud1', role: 'STUDENT' });
const auth = { Authorization: `Bearer ${token}` };
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  (authService.getUserById as any).mockResolvedValue({ id: 'stud1', avatarUrl: '/files/download/stud1' });
});

describe('PUT /api/auth/me/avatar', () => {
  it('requires signing in', async () => {
    const res = await request(app).put('/api/auth/me/avatar').attach('avatar', png, 'a.png');
    expect(res.status).toBe(401);
    expect(avatarService.setAvatar).not.toHaveBeenCalled();
  });

  it("changes only the signed-in user's own picture, whatever the request names", async () => {
    const res = await request(app).put('/api/auth/me/avatar').set(auth)
      .field('userId', 'someone-else').attach('avatar', png, 'a.png');
    expect(res.status).toBe(200);
    expect(avatarService.setAvatar).toHaveBeenCalledWith('stud1', expect.any(Buffer));
    expect(res.body.data.user).toMatchObject({ id: 'stud1' });
  });

  it('answers 400 when no file came with the request', async () => {
    const res = await request(app).put('/api/auth/me/avatar').set(auth);
    expect(res.status).toBe(400);
    expect(avatarService.setAvatar).not.toHaveBeenCalled();
  });

  it('answers 413 for a file over the size limit', async () => {
    const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await request(app).put('/api/auth/me/avatar').set(auth).attach('avatar', big, 'a.png');
    expect(res.status).toBe(413);
    expect(avatarService.setAvatar).not.toHaveBeenCalled();
  });

  it('passes on the 400 for a file that is not an allowed image', async () => {
    (avatarService.setAvatar as any).mockRejectedValue(new AppError('bad', 'יש להעלות תמונה', 400));
    const res = await request(app).put('/api/auth/me/avatar').set(auth).attach('avatar', Buffer.from('hello'), 'a.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('יש להעלות תמונה');
  });
});

describe('DELETE /api/auth/me/avatar', () => {
  it('requires signing in', async () => {
    const res = await request(app).delete('/api/auth/me/avatar');
    expect(res.status).toBe(401);
  });

  it("removes only the signed-in user's own picture and returns her", async () => {
    const res = await request(app).delete('/api/auth/me/avatar').set(auth);
    expect(res.status).toBe(200);
    expect(avatarService.removeAvatar).toHaveBeenCalledWith('stud1');
    expect(res.body.data.user).toMatchObject({ id: 'stud1' });
  });
});
