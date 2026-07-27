import { describe, it, expect, vi, beforeEach } from 'vitest';

// Keep the Redis/BullMQ queues out of the import chain — the messages and
// submissions controllers enqueue jobs through this module.
vi.mock('../../src/infrastructure/queues/queues', () => ({
  emailQueue: { add: vi.fn() },
  aiReviewQueue: { add: vi.fn() },
}));

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    teacherMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/courses.service', () => ({
  getCoursesForUser: vi.fn(),
  createCourse: vi.fn(),
  getCourseById: vi.fn(),
  updateCourse: vi.fn(),
  copyCourse: vi.fn(),
  addCourseLink: vi.fn(),
  deleteCourseLink: vi.fn(),
  uploadCourseFile: vi.fn(),
  deleteCourseFile: vi.fn(),
}));
vi.mock('../../src/services/groups.service', () => ({
  getGroups: vi.fn(),
  createGroup: vi.fn(),
  getGroupById: vi.fn(),
  updateGroup: vi.fn(),
  addStudent: vi.fn(),
  removeStudent: vi.fn(),
  importStudents: vi.fn(),
  resetStudentPassword: vi.fn(),
}));
vi.mock('../../src/services/lessons.service', () => ({
  getLessons: vi.fn(),
  createLesson: vi.fn(),
  getLessonById: vi.fn(),
  setLessonProgress: vi.fn(),
  updateLesson: vi.fn(),
  reorderLessons: vi.fn(),
  uploadLessonFile: vi.fn(),
  deleteLessonFile: vi.fn(),
  getLessonAccess: vi.fn(),
  grantLessonAccess: vi.fn(),
  revokeLessonAccess: vi.fn(),
  importMarkdown: vi.fn(),
}));
vi.mock('../../src/services/assignments.service', () => ({
  getAssignments: vi.fn(),
  createAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  importAssignments: vi.fn(),
  getAssignmentSubmissions: vi.fn(),
}));
vi.mock('../../src/services/quizzes.service', () => ({
  getQuiz: vi.fn(),
  submitQuizAttempt: vi.fn(),
  getQuizResults: vi.fn(),
}));
vi.mock('../../src/services/ai-usage.service', () => ({
  getSummary: vi.fn(),
}));

import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/utils/jwt';
import { GENERIC_SERVER_ERROR } from '../../src/utils/http';
import { prisma } from '../../src/config/prisma';
import * as coursesService from '../../src/services/courses.service';
import * as groupsService from '../../src/services/groups.service';
import * as lessonsService from '../../src/services/lessons.service';
import * as assignmentsService from '../../src/services/assignments.service';
import * as quizzesService from '../../src/services/quizzes.service';
import * as aiUsageService from '../../src/services/ai-usage.service';

const p = prisma as any;
const app = createApp();
const student = signAccessToken({ userId: 'stud1', role: 'STUDENT' });
const admin = signAccessToken({ userId: 'admin1', role: 'ADMIN' });
const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;

beforeEach(() => vi.clearAllMocks());

describe('auth guard', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(401);
  });
});

describe('courses controller', () => {
  it('GET /api/courses returns the caller’s courses', async () => {
    (coursesService.getCoursesForUser as any).mockResolvedValue([{ id: 'c1' }]);
    const res = await request(app).get('/api/courses').set(...bearer(student));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(coursesService.getCoursesForUser).toHaveBeenCalledWith('stud1', 'STUDENT');
  });

  it('POST /api/courses is admin-only', async () => {
    const res = await request(app).post('/api/courses').set(...bearer(student)).send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(coursesService.createCourse).not.toHaveBeenCalled();
  });

  it('POST /api/courses creates for an admin', async () => {
    (coursesService.createCourse as any).mockResolvedValue({ id: 'c9' });
    const res = await request(app).post('/api/courses').set(...bearer(admin)).send({ name: 'React' });
    expect(res.status).toBe(201);
    expect(res.body.data.course).toMatchObject({ id: 'c9' });
  });

  it('GET /api/courses/:id maps a missing course to 404', async () => {
    (coursesService.getCourseById as any).mockResolvedValue(null);
    const res = await request(app).get('/api/courses/nope').set(...bearer(student));
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('groups controller', () => {
  it('GET /api/groups is admin-only', async () => {
    const res = await request(app).get('/api/groups').set(...bearer(student));
    expect(res.status).toBe(403);
  });

  it('GET /api/groups lists for an admin', async () => {
    (groupsService.getGroups as any).mockResolvedValue([{ id: 'g1' }]);
    const res = await request(app).get('/api/groups').set(...bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.groups).toEqual([{ id: 'g1' }]);
  });

  it('POST /api/groups creates a group', async () => {
    (groupsService.createGroup as any).mockResolvedValue({ id: 'g9' });
    const res = await request(app).post('/api/groups').set(...bearer(admin)).send({ name: 'י"ב' });
    expect(res.status).toBe(201);
  });
});

describe('lessons controller', () => {
  it('GET /api/lessons/:id passes the caller identity to the service', async () => {
    (lessonsService.getLessonById as any).mockResolvedValue({ id: 'l1' });
    const res = await request(app).get('/api/lessons/l1').set(...bearer(student));
    expect(res.status).toBe(200);
    expect(lessonsService.getLessonById).toHaveBeenCalledWith('l1', 'stud1', 'STUDENT');
  });

  it('GET /api/lessons/:id maps a 403 from the service to a 403 envelope', async () => {
    (lessonsService.getLessonById as any).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 })
    );
    const res = await request(app).get('/api/lessons/hidden').set(...bearer(student));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: 'Forbidden' });
  });

  it('POST /api/lessons/:id/progress records completion', async () => {
    (lessonsService.setLessonProgress as any).mockResolvedValue({ completed: true });
    const res = await request(app).post('/api/lessons/l1/progress').set(...bearer(student)).send({ completed: true });
    expect(res.status).toBe(200);
    expect(lessonsService.setLessonProgress).toHaveBeenCalledWith('stud1', 'l1', true);
  });
});

describe('assignments controller', () => {
  it('GET /api/lessons/:lessonId/assignments lists', async () => {
    (assignmentsService.getAssignments as any).mockResolvedValue([{ id: 'a1' }]);
    const res = await request(app).get('/api/lessons/l1/assignments').set(...bearer(student));
    expect(res.status).toBe(200);
  });

  it('GET /api/assignments/:id/submissions is admin-only', async () => {
    const res = await request(app).get('/api/assignments/a1/submissions').set(...bearer(student));
    expect(res.status).toBe(403);
  });

  it('GET /api/assignments/:id/submissions returns rows for an admin', async () => {
    (assignmentsService.getAssignmentSubmissions as any).mockResolvedValue([{ id: 's1' }]);
    const res = await request(app).get('/api/assignments/a1/submissions').set(...bearer(admin));
    expect(res.status).toBe(200);
  });
});

describe('quizzes controller', () => {
  it('GET /api/lessons/:id/quiz returns a quiz', async () => {
    (quizzesService.getQuiz as any).mockResolvedValue({ id: 'q1', questions: [] });
    const res = await request(app).get('/api/lessons/l1/quiz').set(...bearer(student));
    expect(res.status).toBe(200);
    expect(quizzesService.getQuiz).toHaveBeenCalledWith('l1', 'stud1', 'STUDENT');
  });

  it('POST /api/lessons/:id/quiz/attempt is student-only', async () => {
    const res = await request(app).post('/api/lessons/l1/quiz/attempt').set(...bearer(admin)).send({ answers: [] });
    expect(res.status).toBe(403);
  });

  it('POST /api/lessons/:id/quiz/attempt scores an attempt', async () => {
    (quizzesService.submitQuizAttempt as any).mockResolvedValue({ score: 100, correct: 1, total: 1 });
    const res = await request(app).post('/api/lessons/l1/quiz/attempt').set(...bearer(student)).send({ answers: [0] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ score: 100 });
  });
});

describe('ai-usage controller', () => {
  it('GET /api/ai-usage/summary is admin-only', async () => {
    const res = await request(app).get('/api/ai-usage/summary').set(...bearer(student));
    expect(res.status).toBe(403);
  });

  it('GET /api/ai-usage/summary returns the summary for an admin', async () => {
    (aiUsageService.getSummary as any).mockResolvedValue({ totalUsd: 1.23 });
    const res = await request(app).get('/api/ai-usage/summary').set(...bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalUsd: 1.23 });
  });

  it('maps a thrown service error to a 500 envelope without leaking the internal message', async () => {
    (aiUsageService.getSummary as any).mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/ai-usage/summary').set(...bearer(admin));
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // The real cause (which could be a DB / secret detail) must never reach the client.
    expect(res.body.error).not.toContain('boom');
    expect(res.body.error).toBe(GENERIC_SERVER_ERROR);
  });
});

describe('messages controller', () => {
  it('POST /api/messages rejects an empty body with 400', async () => {
    const res = await request(app).post('/api/messages').set(...bearer(student)).send({ content: '   ' });
    expect(res.status).toBe(400);
    expect(p.teacherMessage.create).not.toHaveBeenCalled();
  });

  it('POST /api/messages stores the message and enqueues the teacher email', async () => {
    p.teacherMessage.create.mockResolvedValue({ id: 'm1', content: 'hi', student: { id: 'stud1', name: 'Dina', email: 'd@x' } });
    const res = await request(app).post('/api/messages').set(...bearer(student)).send({ content: 'hi' });
    expect(res.status).toBe(201);
    expect(p.teacherMessage.create).toHaveBeenCalled();
  });

  it('GET /api/messages is admin-only and lists all messages', async () => {
    p.teacherMessage.findMany.mockResolvedValue([{ id: 'm1' }]);
    const forbidden = await request(app).get('/api/messages').set(...bearer(student));
    expect(forbidden.status).toBe(403);
    const ok = await request(app).get('/api/messages').set(...bearer(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.data.messages).toEqual([{ id: 'm1' }]);
  });

  it('GET /api/messages/mine returns only the student’s own messages', async () => {
    p.teacherMessage.findMany.mockResolvedValue([{ id: 'm1' }]);
    const res = await request(app).get('/api/messages/mine').set(...bearer(student));
    expect(res.status).toBe(200);
    expect(p.teacherMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 'stud1' } })
    );
  });

  it('POST /api/messages/:id/reply rejects an empty reply with 400', async () => {
    const res = await request(app).post('/api/messages/m1/reply').set(...bearer(admin)).send({ reply: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/messages/:id/reply saves the reply for an admin', async () => {
    p.teacherMessage.update.mockResolvedValue({ id: 'm1', content: 'q', replyContent: 'a', student: { name: 'Dina', email: 'd@x' } });
    const res = await request(app).post('/api/messages/m1/reply').set(...bearer(admin)).send({ reply: 'here you go' });
    expect(res.status).toBe(200);
    expect(p.teacherMessage.update).toHaveBeenCalled();
  });

  it('GET /api/messages/unread-count counts unread for an admin', async () => {
    p.teacherMessage.count.mockResolvedValue(3);
    const res = await request(app).get('/api/messages/unread-count').set(...bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
  });
});
