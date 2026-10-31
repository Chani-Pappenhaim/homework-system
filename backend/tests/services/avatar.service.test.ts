import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('../../src/utils/storage', () => ({
  uploadSquareImage: vi.fn(),
  destroyByUrl: vi.fn(),
}));

import { prisma } from '../../src/config/prisma';
import { uploadSquareImage, destroyByUrl } from '../../src/utils/storage';
import { setAvatar, removeAvatar } from '../../src/services/avatar.service';

const p = prisma as any;
const upload = vi.mocked(uploadSquareImage);
const destroy = vi.mocked(destroyByUrl);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  p.user.findUnique.mockResolvedValue({ avatarUrl: 'old-url' });
  p.user.update.mockResolvedValue({});
  upload.mockResolvedValue({ url: 'new-url', bytes: 1, resourceType: 'image', publicId: 'x' });
  destroy.mockResolvedValue(undefined);
});

describe('setAvatar', () => {
  it('rejects bytes that are not an allowed image, before touching storage', async () => {
    await expect(setAvatar('u1', Buffer.from('not an image at all'))).rejects.toMatchObject({ status: 400 });
    expect(upload).not.toHaveBeenCalled();
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it('stores the picture as a 256px square and saves it on her own account only', async () => {
    await setAvatar('u1', PNG);
    expect(upload).toHaveBeenCalledWith(PNG, 'image/png', 'avatars', 256);
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { avatarUrl: 'new-url' } });
  });

  it('deletes the old file when replacing, after the new one is saved', async () => {
    const order: string[] = [];
    p.user.update.mockImplementation(async () => { order.push('save'); });
    destroy.mockImplementation(async () => { order.push('destroy'); });
    await setAvatar('u1', PNG);
    expect(destroy).toHaveBeenCalledWith('old-url');
    expect(order).toEqual(['save', 'destroy']);
  });

  it('deletes nothing when she had no picture before', async () => {
    p.user.findUnique.mockResolvedValue({ avatarUrl: null });
    await setAvatar('u1', PNG);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('removes the new file and keeps the old one when saving fails', async () => {
    p.user.update.mockRejectedValue(new Error('db down'));
    await expect(setAvatar('u1', PNG)).rejects.toThrow('db down');
    expect(destroy).toHaveBeenCalledWith('new-url');
    expect(destroy).not.toHaveBeenCalledWith('old-url');
  });

  it('still succeeds when deleting the old file fails', async () => {
    destroy.mockRejectedValue(new Error('storage down'));
    await expect(setAvatar('u1', PNG)).resolves.toBeUndefined();
  });

  it('404s for an account that no longer exists', async () => {
    p.user.findUnique.mockResolvedValue(null);
    await expect(setAvatar('gone', PNG)).rejects.toMatchObject({ status: 404 });
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('removeAvatar', () => {
  it('clears the account and deletes the stored file', async () => {
    await removeAvatar('u1');
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { avatarUrl: null } });
    expect(destroy).toHaveBeenCalledWith('old-url');
  });

  it('does nothing when she has no picture', async () => {
    p.user.findUnique.mockResolvedValue({ avatarUrl: null });
    await removeAvatar('u1');
    expect(p.user.update).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
