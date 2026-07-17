import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Prevent BullMQ/Redis from being touched when the worker graph is imported ---
vi.mock('bullmq', () => {
  class Queue { add = vi.fn(async () => ({})); }
  class Worker { on = vi.fn(); }
  class QueueEvents { on = vi.fn(); }
  return { Queue, Worker, QueueEvents };
});

// Keep prisma from constructing a real pg pool / connecting
vi.mock('../../src/config/prisma', () => ({
  prisma: {
    submission: { findUnique: vi.fn(), update: vi.fn() },
    grade: { upsert: vi.fn() },
  },
}));

// --- Service module mocks (controllers under test call these) ---
vi.mock('../../src/services/auth.service', () => ({
  loginWithPassword: vi.fn(),
  getUserById: vi.fn(),
  changePassword: vi.fn(),
  toUserDTO: (u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword }),
}));
vi.mock('../../src/services/submissions.service', () => ({
  submitAssignment: vi.fn(),
  getMySubmissions: vi.fn(),
  getSubmissionById: vi.fn(),
  importSubmissions: vi.fn(),
}));
vi.mock('../../src/services/grades.service', () => ({
  gradeSubmission: vi.fn(),
  getReport: vi.fn(),
  exportReport: vi.fn(),
  getPendingGrades: vi.fn(),
}));

import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import * as authService from '../../src/services/auth.service';
import * as submissionsService from '../../src/services/submissions.service';
import * as gradesService from '../../src/services/grades.service';
import { prisma } from '../../src/config/prisma';

const p = prisma as any;

const app = createApp();
const studentToken = signAccessToken({ userId: 'stud1', role: 'STUDENT' });
const adminToken = signAccessToken({ userId: 'admin1', role: 'ADMIN' });

beforeEach(() => vi.clearAllMocks());

describe('auth controller', () => {
  it('POST /api/auth/login returns { success, data:{ user, accessToken } }', async () => {
    (authService.loginWithPassword as any).mockResolvedValue({
      id: 'u1', name: 'Dina', email: 'd@x.com', role: 'STUDENT', mustChangePassword: false,
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'd@x.com', password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ id: 'u1', email: 'd@x.com' });
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user).not.toHaveProperty('password');
  });

  it('POST /api/auth/login maps a thrown 401 to a 401 envelope', async () => {
    (authService.loginWithPassword as any).mockRejectedValue(
      Object.assign(new Error('Invalid credentials'), { status: 401 })
    );
    const res = await request(app).post('/api/auth/login').send({ email: 'd@x.com', password: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Invalid credentials' });
  });

  it('GET /api/auth/me without a token is rejected 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/me with a valid token returns the user', async () => {
    (authService.getUserById as any).mockResolvedValue({
      id: 'stud1', name: 'S', email: 's@x.com', role: 'STUDENT', mustChangePassword: false,
    });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe('stud1');
  });
});

describe('submissions controller', () => {
  it('GET /api/submissions/mine requires auth (401 without token)', async () => {
    const res = await request(app).get('/api/submissions/mine');
    expect(res.status).toBe(401);
  });

  it('GET /api/submissions/mine returns the split payload for a student', async () => {
    (submissionsService.getMySubmissions as any).mockResolvedValue({ pending: [], submitted: [] });
    const res = await request(app).get('/api/submissions/mine').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { pending: [], submitted: [] } });
  });

  it('POST /api/assignments/:id/submit is 403 for a non-student (ADMIN)', async () => {
    const res = await request(app)
      .post('/api/assignments/a1/submit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ repoName: 'r' });
    expect(res.status).toBe(403);
    expect(submissionsService.submitAssignment).not.toHaveBeenCalled();
  });

  it('POST /api/assignments/:id/submit succeeds for a student', async () => {
    (submissionsService.submitAssignment as any).mockResolvedValue({ id: 'sub1', githubUrl: 'g' });
    const res = await request(app)
      .post('/api/assignments/a1/submit')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ repoName: 'my-repo' });
    expect(res.status).toBe(200);
    expect(res.body.data.submission).toMatchObject({ id: 'sub1' });
    expect(submissionsService.submitAssignment).toHaveBeenCalledWith('a1', 'stud1', { repoName: 'my-repo', notes: undefined });
  });

  it('POST submit with no file/repo returns 400', async () => {
    const res = await request(app)
      .post('/api/assignments/a1/submit')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('GET /api/submissions/:id maps a service 403 to a 403 envelope', async () => {
    (submissionsService.getSubmissionById as any).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 })
    );
    const res = await request(app).get('/api/submissions/sub9').set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });
});

describe('submissions controller — AI review (prisma-direct routes)', () => {
  it('request-ai-review returns 404 when submission not found', async () => {
    p.submission.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });

  it('request-ai-review returns 403 when the submission belongs to another student', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', studentId: 'someone-else', githubUrl: 'g' });
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('request-ai-review returns 400 when there is no GitHub URL', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', studentId: 'stud1', githubUrl: null });
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No GitHub URL/);
  });

  it('request-ai-review returns 400 when the review limit is reached', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 'stud1', githubUrl: 'g', aiExtraAllowed: false, aiReviewCount: 1, aiStatus: null,
    });
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit reached/);
  });

  it('request-ai-review returns 400 when a review is already pending', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 'stud1', githubUrl: 'g', aiExtraAllowed: false, aiReviewCount: 0, aiStatus: 'pending',
    });
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already in progress/);
  });

  it('request-ai-review enqueues and sets pending on the happy path', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 'stud1', githubUrl: 'g', aiExtraAllowed: false, aiReviewCount: 0, aiStatus: null,
    });
    p.submission.update.mockResolvedValue({});
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(p.submission.update).toHaveBeenCalledWith({ where: { id: 'sub1' }, data: { aiStatus: 'pending' } });
  });

  it('restore-ai-score returns 400 when there is no AI score', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiScore: null });
    const res = await request(app)
      .post('/api/submissions/sub1/restore-ai-score')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('restore-ai-score upserts the grade back to the AI score for an admin', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiScore: 77 });
    p.grade.upsert.mockResolvedValue({ id: 'gr1', score: 77 });
    const res = await request(app)
      .post('/api/submissions/sub1/restore-ai-score')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.grade).toMatchObject({ score: 77 });
    expect(p.grade.upsert).toHaveBeenCalled();
  });

  it('restore-ai-score is 403 for a student (ADMIN-only route)', async () => {
    const res = await request(app)
      .post('/api/submissions/sub1/restore-ai-score')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('grades controller', () => {
  it('POST /api/submissions/:id/grade is 403 for a student', async () => {
    const res = await request(app)
      .post('/api/submissions/sub1/grade')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ score: 90 });
    expect(res.status).toBe(403);
    expect(gradesService.gradeSubmission).not.toHaveBeenCalled();
  });

  it('POST /api/submissions/:id/grade succeeds for an admin', async () => {
    (gradesService.gradeSubmission as any).mockResolvedValue({ id: 'gr1', score: 90 });
    const res = await request(app)
      .post('/api/submissions/sub1/grade')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ score: 90, feedback: 'great' });
    expect(res.status).toBe(200);
    expect(res.body.data.grade).toMatchObject({ id: 'gr1', score: 90 });
    expect(gradesService.gradeSubmission).toHaveBeenCalledWith('sub1', 'admin1', { score: 90, feedback: 'great' });
  });

  it('GET /api/grades/pending returns the pending payload for an admin', async () => {
    (gradesService.getPendingGrades as any).mockResolvedValue({ count: 0, submissions: [] });
    const res = await request(app).get('/api/grades/pending').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { count: 0, submissions: [] } });
  });

  it('GET /api/grades/pending is 401 without a token', async () => {
    const res = await request(app).get('/api/grades/pending');
    expect(res.status).toBe(401);
  });
});
