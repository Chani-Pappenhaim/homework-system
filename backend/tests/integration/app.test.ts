import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Prevent BullMQ/Redis from being touched when the worker graph is imported ---
vi.mock('bullmq', () => {
  class Queue { add = vi.fn(async () => ({})); }
  class Worker { on = vi.fn(); }
  class QueueEvents { on = vi.fn(); }
  return { Queue, Worker, QueueEvents };
});

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
  requestAiReview: vi.fn(),
  approveAiReview: vi.fn(),
  restoreAiScore: vi.fn(),
  allowExtraAiReview: vi.fn(),
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

const app = createApp();
const studentToken = signAccessToken({ userId: 'stud1', role: 'STUDENT' });
const adminToken = signAccessToken({ userId: 'admin1', role: 'ADMIN' });

beforeEach(() => vi.clearAllMocks());

describe('health check', () => {
  it('GET /api/health returns 200 without auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
    expect(typeof res.body.data.uptime).toBe('number');
  });
});

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

describe('submissions controller — AI review (service-backed routes)', () => {
  it('request-ai-review returns 404 when submission not found', async () => {
    (submissionsService.requestAiReview as any).mockRejectedValue(
      Object.assign(new Error('Submission not found'), { status: 404 })
    );
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
    expect(submissionsService.requestAiReview).toHaveBeenCalledWith('sub1', 'stud1');
  });

  it('request-ai-review returns 403 when the submission belongs to another student', async () => {
    (submissionsService.requestAiReview as any).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 })
    );
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('request-ai-review returns 400 when there is no GitHub URL', async () => {
    (submissionsService.requestAiReview as any).mockRejectedValue(
      Object.assign(new Error('No GitHub URL on submission'), { status: 400 })
    );
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No GitHub URL/);
  });

  it('request-ai-review returns 400 when the review limit is reached', async () => {
    (submissionsService.requestAiReview as any).mockRejectedValue(
      Object.assign(new Error('AI review limit reached'), { status: 400 })
    );
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit reached/);
  });

  it('request-ai-review returns 400 when a review is already pending', async () => {
    (submissionsService.requestAiReview as any).mockRejectedValue(
      Object.assign(new Error('Review already in progress'), { status: 400 })
    );
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already in progress/);
  });

  it('request-ai-review succeeds on the happy path', async () => {
    (submissionsService.requestAiReview as any).mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/submissions/sub1/request-ai-review')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(submissionsService.requestAiReview).toHaveBeenCalledWith('sub1', 'stud1');
  });

  it('restore-ai-score returns 400 when there is no AI score', async () => {
    (submissionsService.restoreAiScore as any).mockRejectedValue(
      Object.assign(new Error('אין ציון AI להגשה זו'), { status: 400 })
    );
    const res = await request(app)
      .post('/api/submissions/sub1/restore-ai-score')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('restore-ai-score upserts the AI score into contentScore for an admin', async () => {
    (submissionsService.restoreAiScore as any).mockResolvedValue({ id: 'gr1', contentScore: 77 });
    const res = await request(app)
      .post('/api/submissions/sub1/restore-ai-score')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.grade).toMatchObject({ contentScore: 77 });
    expect(submissionsService.restoreAiScore).toHaveBeenCalledWith('sub1', 'admin1');
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
      .send({ submissionScore: 90 });
    expect(res.status).toBe(403);
    expect(gradesService.gradeSubmission).not.toHaveBeenCalled();
  });

  it('POST /api/submissions/:id/grade succeeds for an admin', async () => {
    (gradesService.gradeSubmission as any).mockResolvedValue({ id: 'gr1', submissionScore: 90, contentScore: 80 });
    const res = await request(app)
      .post('/api/submissions/sub1/grade')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ submissionScore: 90, contentScore: 80, feedback: 'great' });
    expect(res.status).toBe(200);
    expect(res.body.data.grade).toMatchObject({ id: 'gr1', submissionScore: 90, contentScore: 80 });
    expect(gradesService.gradeSubmission).toHaveBeenCalledWith('sub1', 'admin1', { submissionScore: 90, contentScore: 80, feedback: 'great' });
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
