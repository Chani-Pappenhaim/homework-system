import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    lessonFile: { findUnique: vi.fn() },
    courseFile: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/utils/storage', () => ({
  toDeliveryUrl: vi.fn((url: string) => `https://signed.cloudinary/${url}`),
}));

vi.mock('../../src/utils/access', () => ({
  assertLessonAccess: vi.fn(),
  assertCourseAccess: vi.fn(),
}));

import { prisma } from '../../src/config/prisma';
import { assertLessonAccess, assertCourseAccess } from '../../src/utils/access';
import { toDeliveryUrl } from '../../src/utils/storage';
import { signFileToken } from '../../src/utils/jwt';
import filesRoutes from '../../src/routes/files.routes';

const p = prisma as unknown as {
  lessonFile: { findUnique: ReturnType<typeof vi.fn> };
  courseFile: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const app = express();
app.use('/api/files', filesRoutes);

// helmet is not mounted in this bare test app, so its clickjacking headers are
// applied here instead — otherwise the route's removal of them is invisible.
const hardenedApp = express();
hardenedApp.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self';frame-ancestors 'self'");
  next();
});
hardenedApp.use('/api/files', filesRoutes);

function fakeUpstream(status: number, headers: Record<string, string>, body = 'file-bytes') {
  const bytes = new TextEncoder().encode(body);
  const allHeaders = { 'content-length': String(bytes.length), ...headers };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => allHeaders[k.toLowerCase()] ?? null },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

describe('GET /api/files/download/:fileId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertLessonAccess).mockResolvedValue(undefined);
    vi.mocked(assertCourseAccess).mockResolvedValue(undefined);
    vi.mocked(toDeliveryUrl).mockImplementation((url: string) => `https://signed.cloudinary/${url}`);
    p.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1',
      lessonId: 'l1',
      name: 'קובץ.mp3',
      url: 'https://res.cloudinary.com/demo/video/upload/v1/f1.mp3',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeUpstream(200, { 'content-type': 'audio/mpeg' })));
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/files/download/f1');
    expect(res.status).toBe(401);
  });

  it('rejects a token whose fileId does not match the URL param', async () => {
    const token = signFileToken({ fileId: 'other-file', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(401);
  });

  it('rejects an expired/garbage token', async () => {
    const res = await request(app).get('/api/files/download/f1').query({ token: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the file row no longer exists', async () => {
    p.lessonFile.findUnique.mockResolvedValue(null);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(404);
  });

  it('returns 403 when lesson access is denied (e.g. access revoked after token issue)', async () => {
    vi.mocked(assertLessonAccess).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(403);
    expect(assertLessonAccess).toHaveBeenCalledWith('u1', 'STUDENT', 'l1');
  });

  it('checks course access (not lesson access) for a course-file token', async () => {
    p.courseFile.findUnique.mockResolvedValue({
      id: 'f2',
      courseId: 'c1',
      name: 'notes.pdf',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/f2.pdf',
    });
    const token = signFileToken({ fileId: 'f2', kind: 'course', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f2').query({ token });
    expect(res.status).toBe(200);
    expect(assertCourseAccess).toHaveBeenCalledWith('u1', 'STUDENT', 'c1');
    expect(assertLessonAccess).not.toHaveBeenCalled();
  });

  it('streams the file inline by default with the correct headers', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('sends Content-Disposition: attachment when ?dl=1', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token, dl: '1' });
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('returns 502 when the upstream Cloudinary fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeUpstream(500, {})));
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(502);
  });

  it('forwards an incoming Range header to Cloudinary and mirrors back a 206/Content-Range response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeUpstream(206, { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-10/11' }, 'partial')
    );
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app)
      .get('/api/files/download/f1')
      .query({ token })
      .set('Range', 'bytes=0-10');

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { headers: { Range: 'bytes=0-10' } });
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-10/11');
  });

  it('puts the extension back on a display name that lost it', async () => {
    // What the upload form actually stores: the teacher's name, no extension,
    // beside a url that still ends in the real one.
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1', lessonId: 'l1', name: 'חוזה',
      url: 'https://res.cloudinary.com/demo/raw/upload/v1/f1.pdf',
    });
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token, dl: '1' });

    expect(res.headers['content-disposition']).toContain(encodeURIComponent('חוזה.pdf'));
    // The ascii fallback must carry the extension too, or the saved file opens
    // in nothing.
    expect(res.headers['content-disposition']).toMatch(/filename="[^"]*\.pdf"/);
  });

  it('types a raw asset from its filename when Cloudinary only says octet-stream', async () => {
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1', lessonId: 'l1', name: 'עבודה.docx',
      url: 'https://res.cloudinary.com/demo/raw/upload/v1/f1.docx',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      fakeUpstream(200, { 'content-type': 'application/octet-stream' })
    ));
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });

    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('keeps the upstream content type when it is a real one', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.headers['content-type']).toBe('audio/mpeg');
  });

  it('falls back to the whole file when something in between refuses the range', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeUpstream(418, { 'content-type': 'text/html' }, '<html>blocked</html>'))
      .mockResolvedValueOnce(fakeUpstream(200, { 'content-type': 'audio/mpeg' }, 'the whole clip'));
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token }).set('Range', 'bytes=0-4');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1]).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('the whole clip');
  });

  it('drops the clickjacking headers so the SPA on another origin can embed the file', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(hardenedApp).get('/api/files/download/f1').query({ token });

    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('sandboxes a file the browser would run as a document instead', async () => {
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1', lessonId: 'l1', name: 'logo.svg',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/f1.svg',
    });
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(hardenedApp).get('/api/files/download/f1').query({ token });

    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['x-frame-options']).toBeUndefined();
  });

  it('does not forward a Range header, and does not return 206, when the browser sent none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeUpstream(200, { 'content-type': 'audio/mpeg' }));
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), undefined);
    expect(res.status).toBe(200);
    expect(res.headers['content-range']).toBeUndefined();
  });
});
