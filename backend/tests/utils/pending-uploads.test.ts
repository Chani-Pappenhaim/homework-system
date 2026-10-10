import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resourceFn, byTagFn, removeTagFn, destroyFn, countRefsMock, destroyByUrlMock } = vi.hoisted(() => ({
  resourceFn: vi.fn(),
  byTagFn: vi.fn(),
  removeTagFn: vi.fn(),
  destroyFn: vi.fn(),
  countRefsMock: vi.fn(),
  destroyByUrlMock: vi.fn(),
}));
vi.mock('../../src/config/cloudinary', () => ({
  cloudinary: {
    api: { resource: resourceFn, resources_by_tag: byTagFn },
    uploader: { remove_tag: removeTagFn, destroy: destroyFn },
  },
}));
vi.mock('../../src/utils/file-refs', () => ({ countFileRefs: countRefsMock }));
vi.mock('../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/storage')>()),
  destroyByUrl: destroyByUrlMock,
}));

import { confirmUpload, discardPendingUpload, sweepPendingUploads, PENDING_MAX_AGE_MS } from '../../src/utils/pending-uploads';

const VIDEO = 'https://res.cloudinary.com/c/video/upload/v1/submissions/clip.mp4';

beforeEach(() => {
  vi.clearAllMocks();
  countRefsMock.mockResolvedValue(0);
  destroyByUrlMock.mockResolvedValue(undefined);
});

describe('confirmUpload', () => {
  it('drops the pending tag from the asset the url names', async () => {
    await confirmUpload(VIDEO);
    expect(removeTagFn).toHaveBeenCalledWith('pending_upload', ['submissions/clip'], { resource_type: 'video' });
  });

  it('never throws, since the sweep un-tags a referenced file anyway', async () => {
    removeTagFn.mockRejectedValue(new Error('rate limited'));
    await expect(confirmUpload(VIDEO)).resolves.toBeUndefined();
  });
});

describe('discardPendingUpload', () => {
  it("removes the caller's own pending upload", async () => {
    resourceFn.mockResolvedValue({ tags: ['pending_upload', 'uploader_s1'] });
    expect(await discardPendingUpload(VIDEO, 's1')).toBe(true);
    expect(destroyByUrlMock).toHaveBeenCalledWith(VIDEO);
  });

  it("leaves someone else's upload alone", async () => {
    resourceFn.mockResolvedValue({ tags: ['pending_upload', 'uploader_s2'] });
    expect(await discardPendingUpload(VIDEO, 's1')).toBe(false);
    expect(destroyByUrlMock).not.toHaveBeenCalled();
  });

  it('leaves a registered upload alone', async () => {
    resourceFn.mockResolvedValue({ tags: ['uploader_s1'] });
    expect(await discardPendingUpload(VIDEO, 's1')).toBe(false);
    resourceFn.mockResolvedValue({ tags: ['pending_upload', 'uploader_s1'] });
    countRefsMock.mockResolvedValue(1);
    expect(await discardPendingUpload(VIDEO, 's1')).toBe(false);
    expect(destroyByUrlMock).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing when the asset cannot be looked up', async () => {
    resourceFn.mockRejectedValue(new Error('not found'));
    expect(await discardPendingUpload(VIDEO, 's1')).toBe(false);
    expect(await discardPendingUpload('https://example.com/x.mp4', 's1')).toBe(false);
  });
});

describe('sweepPendingUploads', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  const old = new Date(now - PENDING_MAX_AGE_MS - 1000).toISOString();
  const fresh = new Date(now - 60 * 1000).toISOString();

  it('removes old unreferenced uploads, un-tags referenced ones and spares fresh ones', async () => {
    byTagFn.mockImplementation((_tag: string, { resource_type }: any) => Promise.resolve(
      resource_type === 'video'
        ? { resources: [
            { public_id: 'submissions/abandoned', secure_url: 'u-abandoned', created_at: old },
            { public_id: 'submissions/used', secure_url: 'u-used', created_at: old },
            { public_id: 'submissions/in-flight', secure_url: 'u-fresh', created_at: fresh },
          ] }
        : { resources: [] },
    ));
    countRefsMock.mockImplementation((url: string) => Promise.resolve(url === 'u-used' ? 1 : 0));

    expect(await sweepPendingUploads(now)).toBe(1);
    expect(destroyFn).toHaveBeenCalledTimes(1);
    expect(destroyFn).toHaveBeenCalledWith('submissions/abandoned', { resource_type: 'video' });
    expect(removeTagFn).toHaveBeenCalledWith('pending_upload', ['submissions/used'], { resource_type: 'video' });
  });

  it('follows the listing across pages', async () => {
    byTagFn
      .mockResolvedValueOnce({ resources: [{ public_id: 'a', secure_url: 'ua', created_at: old }], next_cursor: 'n1' })
      .mockResolvedValueOnce({ resources: [{ public_id: 'b', secure_url: 'ub', created_at: old }] })
      .mockResolvedValue({ resources: [] });
    expect(await sweepPendingUploads(now)).toBe(2);
    expect(byTagFn.mock.calls[1][1]).toMatchObject({ next_cursor: 'n1' });
  });

  it('keeps going when one asset fails', async () => {
    byTagFn.mockImplementation((_t: string, { resource_type }: any) => Promise.resolve(
      resource_type === 'raw'
        ? { resources: [{ public_id: 'x', secure_url: 'ux', created_at: old }, { public_id: 'y', secure_url: 'uy', created_at: old }] }
        : { resources: [] },
    ));
    destroyFn.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ result: 'ok' });
    expect(await sweepPendingUploads(now)).toBe(1);
  });
});
