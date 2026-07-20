import { describe, it, expect, vi, beforeEach } from 'vitest';

const { uploadFn, destroyFn } = vi.hoisted(() => ({
  uploadFn: vi.fn(),
  destroyFn: vi.fn(),
}));

vi.mock('../../src/config/cloudinary', () => ({
  cloudinary: { uploader: { upload: uploadFn, destroy: destroyFn } },
}));

import { uploadBuffer, destroyByUrl, toFileDTO, extractPublicId } from '../../src/utils/storage';

beforeEach(() => vi.clearAllMocks());

describe('toFileDTO', () => {
  it('renders a BigInt size as a string so JSON.stringify does not throw', () => {
    const dto = toFileDTO({ id: 'f1', name: 'a.pdf', sizeBytes: 2048n });
    expect(dto.sizeBytes).toBe('2048');
    expect(() => JSON.stringify(dto)).not.toThrow();
  });

  it('maps a missing size to null and preserves the other fields', () => {
    expect(toFileDTO({ id: 'f1', sizeBytes: null }).sizeBytes).toBeNull();
    expect(toFileDTO({ id: 'f1' } as any)).toMatchObject({ id: 'f1', sizeBytes: null });
  });
});

describe('extractPublicId', () => {
  it('strips a version segment and the extension', () => {
    expect(extractPublicId('https://res.cloudinary.com/x/image/upload/v1699/lessons/a.pdf')).toBe('lessons/a');
  });

  it('works without a version segment', () => {
    expect(extractPublicId('https://res.cloudinary.com/x/image/upload/lessons/a.jpg')).toBe('lessons/a');
  });

  it('returns null for a url that is not a cloudinary upload', () => {
    expect(extractPublicId('https://example.com/file.pdf')).toBeNull();
  });
});

describe('uploadBuffer', () => {
  it('sends a base64 data uri and maps the cloudinary result', async () => {
    uploadFn.mockResolvedValue({
      secure_url: 'https://c/x.png', bytes: 10, resource_type: 'image', public_id: 'sub/x',
    });
    const out = await uploadBuffer(Buffer.from('hi'), 'image/png', 'submissions');
    expect(uploadFn).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png;base64,'),
      { resource_type: 'auto', folder: 'submissions' }
    );
    expect(out).toEqual({ url: 'https://c/x.png', bytes: 10, resourceType: 'image', publicId: 'sub/x' });
  });
});

describe('destroyByUrl', () => {
  it('does nothing when the url yields no public id', async () => {
    await destroyByUrl('https://example.com/not-cloudinary.pdf');
    expect(destroyFn).not.toHaveBeenCalled();
  });

  it('destroys with the resource type the url implies and stops on success', async () => {
    destroyFn.mockResolvedValue({ result: 'ok' });
    await destroyByUrl('https://res.cloudinary.com/x/image/upload/v1/lessons/a.png');
    expect(destroyFn).toHaveBeenCalledTimes(1);
    expect(destroyFn).toHaveBeenCalledWith('lessons/a', { resource_type: 'image' });
  });

  it('falls back through the other resource types when the first misses', async () => {
    // 'auto' uploads store a pdf as 'image', so a url that looks 'raw' can miss
    // on the first guess — the asset would otherwise stay billed forever.
    destroyFn
      .mockResolvedValueOnce({ result: 'not found' }) // guessed: raw
      .mockResolvedValueOnce({ result: 'ok' });        // image
    await destroyByUrl('https://res.cloudinary.com/x/raw/upload/v1/lessons/a.pdf');
    expect(destroyFn).toHaveBeenCalledTimes(2);
    expect(destroyFn).toHaveBeenNthCalledWith(1, 'lessons/a', { resource_type: 'raw' });
    expect(destroyFn).toHaveBeenNthCalledWith(2, 'lessons/a', { resource_type: 'image' });
  });
});
