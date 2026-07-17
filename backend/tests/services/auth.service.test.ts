import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/prisma';
import {
  loginWithPassword,
  changePassword,
  getUserById,
  toUserDTO,
} from '../../src/services/auth.service';

const p = prisma as any;
const bc = bcrypt as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth.service', () => {
  describe('toUserDTO', () => {
    it('maps only the public fields', () => {
      const dto = toUserDTO({
        id: 'u1', name: 'Dina', email: 'd@x.com', role: 'STUDENT',
        mustChangePassword: true, password: 'secret-hash', githubUsername: 'gh',
      } as any);
      expect(dto).toEqual({
        id: 'u1', name: 'Dina', email: 'd@x.com', role: 'STUDENT', mustChangePassword: true,
      });
      expect(dto).not.toHaveProperty('password');
    });
  });

  describe('loginWithPassword', () => {
    it('throws 401 when user not found', async () => {
      p.user.findUnique.mockResolvedValue(null);
      await expect(loginWithPassword('none@x.com', 'pw')).rejects.toMatchObject({
        message: 'Invalid credentials', status: 401,
      });
    });

    it('throws 403 when the account has no password (OAuth-only)', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'u1', password: null });
      await expect(loginWithPassword('o@x.com', 'pw')).rejects.toMatchObject({
        message: 'Use OAuth to login', status: 403,
      });
    });

    it('throws 401 when password does not match', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'u1', password: 'hash' });
      bc.compare.mockResolvedValue(false);
      await expect(loginWithPassword('u@x.com', 'bad')).rejects.toMatchObject({ status: 401 });
    });

    it('returns the user on valid credentials', async () => {
      const user = { id: 'u1', password: 'hash', email: 'u@x.com' };
      p.user.findUnique.mockResolvedValue(user);
      bc.compare.mockResolvedValue(true);
      const result = await loginWithPassword('u@x.com', 'good');
      expect(result).toBe(user);
      expect(bc.compare).toHaveBeenCalledWith('good', 'hash');
    });
  });

  describe('getUserById', () => {
    it('delegates to prisma.user.findUnique', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'u9' });
      const r = await getUserById('u9');
      expect(r).toEqual({ id: 'u9' });
      expect(p.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u9' } });
    });
  });

  describe('changePassword', () => {
    it('throws 400 when new password too short', async () => {
      await expect(changePassword('u1', 'old', '123')).rejects.toMatchObject({ status: 400 });
      expect(p.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws 400 when user missing or has no password', async () => {
      p.user.findUnique.mockResolvedValue(null);
      await expect(changePassword('u1', 'old', 'longenough')).rejects.toMatchObject({ status: 400 });
    });

    it('throws 401 when current password is wrong', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'u1', password: 'hash' });
      bc.compare.mockResolvedValue(false);
      await expect(changePassword('u1', 'wrong', 'longenough')).rejects.toMatchObject({ status: 401 });
    });

    it('hashes and updates on success, clearing mustChangePassword', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'u1', password: 'hash' });
      bc.compare.mockResolvedValue(true);
      bc.hash.mockResolvedValue('new-hash');
      p.user.update.mockResolvedValue({});
      await changePassword('u1', 'old', 'newpassword');
      expect(bc.hash).toHaveBeenCalledWith('newpassword', 12);
      expect(p.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password: 'new-hash', mustChangePassword: false },
      });
    });
  });
});
