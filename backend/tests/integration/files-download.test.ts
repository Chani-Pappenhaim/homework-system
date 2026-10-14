import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    lessonFile: { findUnique: vi.fn() },
    courseFile: { findUnique: vi.fn() },
    submission: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/storage')>()),
  toDeliveryUrl: vi.fn((url: string) => `https://signed.cloudinary/${url}`),
}));

vi.mock('../../src/utils/access', () => ({
  assertLessonAccess: vi.fn(),
  assertCourseAccess: vi.fn(),
}));

import { prisma } from '../../src/config/prisma';
import { assertLessonAccess, assertCourseAccess } from '../../src/utils/access';
import { toDeliveryUrl, submissionFileLink } from '../../src/utils/storage';
import { signAccessToken, signFileToken, signRefreshToken } from '../../src/utils/jwt';
import filesRoutes from '../../src/routes/files.routes';

const p = prisma as unknown as {
  lessonFile: { findUnique: ReturnType<typeof vi.fn> };
  courseFile: { findUnique: ReturnType<typeof vi.fn> };
  submission: { findUnique: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/files', filesRoutes);

// helmet is not mounted in this bare test app, so its clickjacking headers are
// applied here instead — otherwise the route's removal of them is invisible.
const hardenedApp = express();
hardenedApp.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self';frame-ancestors 'self'");
  next();
});
hardenedApp.use(cookieParser());
hardenedApp.use('/api/files', filesRoutes);

// The browser of the signed-in user the link was issued to sends this cookie along.
const sessionOf = (userId: string, tokenVersion = 0) =>
  `refreshToken=${signRefreshToken({ userId, role: 'STUDENT', tokenVersion })}`;
const signedIn = (target: express.Express) => ({
  get: (path: string) => request(target).get(path).set('Cookie', sessionOf('u1')),
});

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
    p.user.findUnique.mockResolvedValue({ role: 'STUDENT', tokenVersion: 0 });
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1',
      lessonId: 'l1',
      name: 'קובץ.mp3',
      url: 'https://res.cloudinary.com/demo/video/upload/v1/f1.mp3',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeUpstream(200, { 'content-type': 'audio/mpeg' })));
  });

  it('refuses a copied link opened without signing in', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('יש להתחבר לאתר כדי לפתוח את הקובץ');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a link issued to someone else, even to a signed-in user', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token }).set('Cookie', sessionOf('u2'));
    expect(res.status).toBe(401);
  });

  it('refuses a session revoked by a later password change', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'STUDENT', tokenVersion: 1 });
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token }).set('Cookie', sessionOf('u1', 0));
    expect(res.status).toBe(401);
  });

  it('refuses a forged session cookie', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await request(app).get('/api/files/download/f1').query({ token }).set('Cookie', 'refreshToken=forged');
    expect(res.status).toBe(401);
  });

  it('serves an online viewer\'s link without a session', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1', external: true });
    const res = await request(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(200);
  });

  it('rejects a request with no token', async () => {
    const res = await signedIn(app).get('/api/files/download/f1');
    expect(res.status).toBe(401);
  });

  it('serves the file when the URL carries a cosmetic file.<ext> segment', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1/file.mp3').query({ token });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('audio/mpeg');
  });

  it('rejects a token whose fileId does not match the URL param', async () => {
    const token = signFileToken({ fileId: 'other-file', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(401);
  });

  it('rejects an expired/garbage token', async () => {
    const res = await signedIn(app).get('/api/files/download/f1').query({ token: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the file row no longer exists', async () => {
    p.lessonFile.findUnique.mockResolvedValue(null);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(404);
  });

  it('returns 403 when lesson access is denied (e.g. access revoked after token issue)', async () => {
    vi.mocked(assertLessonAccess).mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });
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
    const res = await signedIn(app).get('/api/files/download/f2').query({ token });
    expect(res.status).toBe(200);
    expect(assertCourseAccess).toHaveBeenCalledWith('u1', 'STUDENT', 'c1');
    expect(assertLessonAccess).not.toHaveBeenCalled();
  });

  it('streams the file inline by default with the correct headers', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('sends Content-Disposition: attachment when ?dl=1', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token, dl: '1' });
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('returns 502 when the upstream Cloudinary fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeUpstream(500, {})));
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });
    expect(res.status).toBe(502);
  });

  it('forwards an incoming Range header to Cloudinary and mirrors back a 206/Content-Range response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeUpstream(206, { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-10/11' }, 'partial')
    );
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app)
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
    const res = await signedIn(app).get('/api/files/download/f1').query({ token, dl: '1' });

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
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });

    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('keeps the upstream content type when it is a real one', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });
    expect(res.headers['content-type']).toBe('audio/mpeg');
  });

  it('falls back to the whole file when something in between refuses the range', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeUpstream(418, { 'content-type': 'text/html' }, '<html>blocked</html>'))
      .mockResolvedValueOnce(fakeUpstream(200, { 'content-type': 'audio/mpeg' }, 'the whole clip'));
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token }).set('Range', 'bytes=0-4');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1]).toBeUndefined();
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('the whole clip');
  });

  it('does not retry without Range on a real upstream failure, only on 418', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fakeUpstream(500, { 'content-type': 'text/plain' }, 'server error'));
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token }).set('Range', 'bytes=0-4');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  it('drops the clickjacking headers so the SPA on another origin can embed the file', async () => {
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(hardenedApp).get('/api/files/download/f1').query({ token });

    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('sandboxes a file the browser would run as a document instead', async () => {
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1', lessonId: 'l1', name: 'logo.svg',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/f1.svg',
    });
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(hardenedApp).get('/api/files/download/f1').query({ token });

    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['x-frame-options']).toBeUndefined();
  });

  it('does not forward a Range header, and does not return 206, when the browser sent none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeUpstream(200, { 'content-type': 'audio/mpeg' }));
    vi.stubGlobal('fetch', fetchMock);
    const token = signFileToken({ fileId: 'f1', kind: 'lesson', userId: 'u1' });
    const res = await signedIn(app).get('/api/files/download/f1').query({ token });

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), undefined);
    expect(res.status).toBe(200);
    expect(res.headers['content-range']).toBeUndefined();
  });
});

describe('POST /api/files/viewer-link', () => {
  const bearer = () => `Bearer ${signAccessToken({ userId: 'u1', role: 'STUDENT' })}`;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assertLessonAccess).mockResolvedValue(undefined);
    p.lessonFile.findUnique.mockResolvedValue({
      id: 'f1', lessonId: 'l1', name: 'מצגת', url: 'https://res.cloudinary.com/demo/raw/upload/v1/f1.pptx', hidden: false,
    });
  });

  it('issues a short-lived link the viewer can fetch without a session', async () => {
    const res = await request(app).post('/api/files/viewer-link').set('Authorization', bearer()).send({ fileId: 'f1', kind: 'lesson' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^\/files\/download\/f1\/file\.pptx\?token=/);
    expect(assertLessonAccess).toHaveBeenCalledWith('u1', 'STUDENT', 'l1');
  });

  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/files/viewer-link').send({ fileId: 'f1', kind: 'lesson' });
    expect(res.status).toBe(401);
  });

  it('refuses a file the user may not open', async () => {
    vi.mocked(assertLessonAccess).mockRejectedValue(new Error('Forbidden'));
    const res = await request(app).post('/api/files/viewer-link').set('Authorization', bearer()).send({ fileId: 'f1', kind: 'lesson' });
    expect(res.status).toBe(403);
  });

  it('refuses a hidden file to a student', async () => {
    p.lessonFile.findUnique.mockResolvedValue({ id: 'f1', lessonId: 'l1', name: 'x', url: 'u', hidden: true });
    const res = await request(app).post('/api/files/viewer-link').set('Authorization', bearer()).send({ fileId: 'f1', kind: 'lesson' });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown kind', async () => {
    const res = await request(app).post('/api/files/viewer-link').set('Authorization', bearer()).send({ fileId: 'f1', kind: 'submission' });
    expect(res.status).toBe(400);
  });
});

describe('a submission file', () => {
  const stored = { id: 's1', studentId: 'u1', fileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/submissions/a.zip', fileName: 'פרויקט.zip' };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(toDeliveryUrl).mockImplementation((url: string) => `https://signed.cloudinary/${url}`);
    p.submission.findUnique.mockResolvedValue(stored);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeUpstream(200, { 'content-type': 'application/zip' })));
  });

  it('is linked through the download route, not straight to Cloudinary', () => {
    const link = submissionFileLink(stored, 'u1');
    expect(link).toMatch(/^\/files\/download\/s1\/file\.zip\?token=/);
    expect(link).not.toContain('cloudinary');
    expect(submissionFileLink({ id: 's2', fileUrl: null }, 'u1')).toBeNull();
  });

  it('opens for the student who submitted it', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'STUDENT', tokenVersion: 0 });
    const path = submissionFileLink(stored, 'u1')!;
    const res = await request(app).get(`/api${path}`).set('Cookie', sessionOf('u1'));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('filename*=');
  });

  it('opens for the teacher', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'ADMIN', tokenVersion: 0 });
    const path = submissionFileLink(stored, 't1')!;
    const res = await request(app).get(`/api${path}`).set('Cookie', sessionOf('t1'));
    expect(res.status).toBe(200);
  });

  it('is refused to another student', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'STUDENT', tokenVersion: 0 });
    const path = submissionFileLink(stored, 'u2')!;
    const res = await request(app).get(`/api${path}`).set('Cookie', sessionOf('u2'));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is refused without signing in', async () => {
    p.user.findUnique.mockResolvedValue({ role: 'STUDENT', tokenVersion: 0 });
    const path = submissionFileLink(stored, 'u1')!;
    const res = await request(app).get(`/api${path}`);
    expect(res.status).toBe(401);
  });
});
