import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/axios', () => ({ default: { post: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock('@/lib/upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upload')>()),
  uploadToCloudinary: vi.fn(),
}));

import api from '@/api/axios';
import { uploadToCloudinary } from '@/lib/upload';
import { buildSignedForm, uploadSignedThenRegister } from '@/lib/signed-upload';

const post = api.post as unknown as ReturnType<typeof vi.fn>;
const upload = uploadToCloudinary as unknown as ReturnType<typeof vi.fn>;
const SIG = {
  apiKey: 'key', cloudName: 'cloud', timestamp: 7, signature: 'sig', folder: 'submissions',
  tags: 'pending_upload,uploader_s1', allowedFormats: 'mp4,mov',
};
const file = new File(['x'], 'clip.mp4');

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/cloud/video/upload/v1/submissions/clip.mp4' });
});

describe('buildSignedForm', () => {
  it('sends every signed param, tags included, exactly as signed', () => {
    const form = buildSignedForm(file, SIG);
    expect(form.get('tags')).toBe('pending_upload,uploader_s1');
    expect(form.get('allowed_formats')).toBe('mp4,mov');
    expect(form.get('timestamp')).toBe('7');
    expect(form.get('folder')).toBe('submissions');
  });

  it('leaves out params the backend did not sign', () => {
    const form = buildSignedForm(file, { ...SIG, tags: undefined, allowedFormats: undefined });
    expect(form.has('tags')).toBe(false);
    expect(form.has('allowed_formats')).toBe(false);
  });
});

describe('uploadSignedThenRegister', () => {
  it('uploads to the given resource type and returns the registration result', async () => {
    const res = await uploadSignedThenRegister(SIG, file, 'video', () => Promise.resolve('saved'));
    expect(res).toBe('saved');
    expect(upload.mock.calls[0][0]).toBe('https://api.cloudinary.com/v1_1/cloud/video/upload');
    expect(post).not.toHaveBeenCalled();
  });

  it('discards the stored file when the backend refuses to register it', async () => {
    const refusal = Object.assign(new Error('403'), { response: { status: 403 } });
    await expect(uploadSignedThenRegister(SIG, file, 'auto', () => Promise.reject(refusal))).rejects.toBe(refusal);
    expect(post).toHaveBeenCalledWith('/files/discard-upload', {
      url: 'https://res.cloudinary.com/cloud/video/upload/v1/submissions/clip.mp4',
    });
  });

  it('does not discard when there was no response, since the save may have gone through', async () => {
    await expect(uploadSignedThenRegister(SIG, file, 'auto', () => Promise.reject(new Error('Network Error')))).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('never reaches registration when the upload itself fails', async () => {
    upload.mockRejectedValue(new Error('blocked'));
    const register = vi.fn();
    await expect(uploadSignedThenRegister(SIG, file, 'auto', register)).rejects.toThrow('blocked');
    expect(register).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
