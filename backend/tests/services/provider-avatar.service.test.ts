import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/avatar.service', () => ({ setAvatar: vi.fn() }));

import { adoptProviderAvatar, isProviderPhotoUrl } from '../../src/services/provider-avatar.service';
import { setAvatar } from '../../src/services/avatar.service';

const photo = 'https://lh3.googleusercontent.com/a/abc=s96-c';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.length) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('isProviderPhotoUrl', () => {
  it('accepts only https links on Google image hosts', () => {
    expect(isProviderPhotoUrl(photo)).toBe(true);
    expect(isProviderPhotoUrl('http://lh3.googleusercontent.com/a')).toBe(false);
    expect(isProviderPhotoUrl('https://evil.com/googleusercontent.com')).toBe(false);
    expect(isProviderPhotoUrl('https://notgoogleusercontent.com/a')).toBe(false);
    expect(isProviderPhotoUrl('not a url')).toBe(false);
  });
});

describe('adoptProviderAvatar', () => {
  it('copies the Google picture, at the stored size, for a user with none', async () => {
    await adoptProviderAvatar({ id: 'u1', avatarUrl: null }, photo);
    expect(fetchMock.mock.calls[0][0]).toBe('https://lh3.googleusercontent.com/a/abc=s256-c');
    expect(setAvatar).toHaveBeenCalledWith('u1', expect.any(Buffer));
  });

  it('never replaces a picture the user already has', async () => {
    await adoptProviderAvatar({ id: 'u1', avatarUrl: 'https://cdn/mine.png' }, photo);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('does nothing without a usable link', async () => {
    await adoptProviderAvatar({ id: 'u1', avatarUrl: null }, undefined);
    await adoptProviderAvatar({ id: 'u1', avatarUrl: null }, 'https://evil.com/x.png');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips an empty or oversized download and a failed response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await adoptProviderAvatar({ id: 'u1', avatarUrl: null }, photo);
    fetchMock.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(3 * 1024 * 1024) });
    await adoptProviderAvatar({ id: 'u1', avatarUrl: null }, photo);
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it('swallows a network or storage failure so sign-in still works', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(adoptProviderAvatar({ id: 'u1', avatarUrl: null }, photo)).resolves.toBeUndefined();
    (setAvatar as any).mockRejectedValueOnce(new Error('cloudinary down'));
    await expect(adoptProviderAvatar({ id: 'u1', avatarUrl: null }, photo)).resolves.toBeUndefined();
  });
});
