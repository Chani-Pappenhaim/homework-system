import { describe, it, expect, vi, beforeEach } from 'vitest';

const { uploadFn, destroyFn, signFn } = vi.hoisted(() => ({
  uploadFn: vi.fn(),
  destroyFn: vi.fn(),
  signFn: vi.fn(),
}));

vi.mock('../../src/config/cloudinary', () => ({
  cloudinary: { uploader: { upload: uploadFn, destroy: destroyFn }, utils: { api_sign_request: signFn } },
}));

import { uploadBuffer, destroyByUrl, toFileDTO, extractPublicId, createUploadSignature, isOwnUpload, assetRef } from '../../src/utils/storage';

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

  it('takes the extension from the URL, or from the name when the URL has none', () => {
    const fromUrl = toFileDTO({ id: 'f1', name: 'slides', url: 'https://res.cloudinary.com/x/raw/upload/v1/a.pptx' }, 'lesson', 'u1');
    expect(fromUrl.extension).toBe('pptx');
    const fromName = toFileDTO({ id: 'f2', name: 'page.html', url: 'https://res.cloudinary.com/x/raw/upload/v1/abc' }, 'lesson', 'u1');
    expect(fromName.extension).toBe('html');
    expect(fromName.url).toMatch(/^\/files\/download\/f2\/file\.html\?token=/);
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
      .mockResolvedValueOnce({ result: 'not found' }) // guessed: raw, id with extension
      .mockResolvedValueOnce({ result: 'not found' }) // raw, id without it
      .mockResolvedValueOnce({ result: 'ok' });        // image
    await destroyByUrl('https://res.cloudinary.com/x/raw/upload/v1/lessons/a.pdf');
    expect(destroyFn).toHaveBeenCalledTimes(3);
    expect(destroyFn).toHaveBeenNthCalledWith(1, 'lessons/a.pdf', { resource_type: 'raw' });
    expect(destroyFn).toHaveBeenNthCalledWith(2, 'lessons/a', { resource_type: 'raw' });
    expect(destroyFn).toHaveBeenNthCalledWith(3, 'lessons/a', { resource_type: 'image' });
  });

  it("addresses a raw file by its full public id, extension included", async () => {
    // Cloudinary keeps a raw asset's extension in its public id; without it a
    // docx or zip is "not found" and never actually deleted.
    destroyFn.mockResolvedValue({ result: 'ok' });
    await destroyByUrl('https://res.cloudinary.com/x/raw/upload/v1/lessons/notes_ab12.docx');
    expect(destroyFn).toHaveBeenCalledTimes(1);
    expect(destroyFn).toHaveBeenCalledWith('lessons/notes_ab12.docx', { resource_type: 'raw' });
  });
});

describe('createUploadSignature', () => {
  it('signs pending and uploader tags along with the folder', () => {
    signFn.mockReturnValue('sig');
    const r = createUploadSignature('submissions', { uploaderId: 'u1', allowedFormats: ['mp4'] });
    expect(signFn).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'submissions', tags: 'pending_upload,uploader_u1', allowed_formats: 'mp4' }),
      process.env.CLOUDINARY_API_SECRET,
    );
    expect(r).toMatchObject({ tags: 'pending_upload,uploader_u1', allowedFormats: 'mp4', signature: 'sig' });
  });
});

describe('isOwnUpload / assetRef', () => {
  it('accepts only our own cloud and the given folder', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'our-cloud';
    expect(isOwnUpload('https://res.cloudinary.com/our-cloud/raw/upload/v1/lessons/a.zip', 'lessons')).toBe(true);
    expect(isOwnUpload('https://res.cloudinary.com/our-cloud/raw/upload/v1/courses/a.zip', 'lessons')).toBe(false);
    expect(isOwnUpload('https://res.cloudinary.com/other/raw/upload/v1/lessons/a.zip', 'lessons')).toBe(false);
    expect(isOwnUpload('http://res.cloudinary.com/our-cloud/raw/upload/v1/lessons/a.zip', 'lessons')).toBe(false);
  });

  it('keeps the extension in a raw public id only', () => {
    expect(assetRef('https://res.cloudinary.com/c/raw/upload/v1/lessons/a.zip')).toEqual({ publicId: 'lessons/a.zip', resourceType: 'raw' });
    expect(assetRef('https://res.cloudinary.com/c/video/upload/v9/submissions/b.mp4')).toEqual({ publicId: 'submissions/b', resourceType: 'video' });
    expect(assetRef('https://example.com/x.pdf')).toBeNull();
  });
});
