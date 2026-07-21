import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    quiz: { findUnique: vi.fn() },
    lesson: { findUnique: vi.fn() },
    quizAttempt: { upsert: vi.fn() },
  },
}));

const { quizAdd } = vi.hoisted(() => ({ quizAdd: vi.fn() }));
vi.mock('../../src/infrastructure/queues/queues', () => ({
  quizQueue: { add: quizAdd },
}));

const { assertLessonAccessMock } = vi.hoisted(() => ({ assertLessonAccessMock: vi.fn() }));
vi.mock('../../src/utils/access', () => ({ assertLessonAccess: assertLessonAccessMock }));

import { prisma } from '../../src/config/prisma';
import { getQuiz, submitQuizAttempt, getQuizResults } from '../../src/services/quizzes.service';

const p = prisma as any;
beforeEach(() => {
  vi.clearAllMocks();
  assertLessonAccessMock.mockResolvedValue(undefined);
});

const questions = [
  { id: 'q1', question: 'A?', options: ['x', 'y'], correctIndex: 0 },
  { id: 'q2', question: 'B?', options: ['x', 'y'], correctIndex: 1 },
];

describe('quizzes.service.getQuiz', () => {
  it('enqueues generation and returns "generating" when no quiz yet but lesson has content', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const r = await getQuiz('l1', 's1', 'STUDENT');
    expect(r).toEqual({ status: 'generating' });
    expect(quizAdd).toHaveBeenCalledWith(
      'generate',
      { lessonId: 'l1', lessonContent: '# content' },
      { jobId: 'quiz:l1' },   // dedup — polling must not bill a Claude call per request
    );
  });

  it('does not enqueue when the lesson has no content', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: null });
    const r = await getQuiz('l1', 's1', 'STUDENT');
    expect(r).toEqual({ status: 'generating' });
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('hides correctIndex from students', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', questions });
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('ready');
    expect(r.quiz.questions[0]).not.toHaveProperty('correctIndex');
  });

  it('exposes correctIndex to admins', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', questions });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.quiz.questions[0].correctIndex).toBe(0);
  });
});

describe('quizzes.service.submitQuizAttempt', () => {
  it('throws 404 when quiz missing', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    await expect(submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1])).rejects.toMatchObject({ status: 404 });
  });

  it('scores a perfect attempt as 100', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', questions });
    p.quizAttempt.upsert.mockResolvedValue({});
    const r = await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1]);
    expect(r).toEqual({ score: 100, correct: 2, total: 2 });
  });

  it('scores a half-correct attempt as 50', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', questions });
    p.quizAttempt.upsert.mockResolvedValue({});
    const r = await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 0]);
    expect(r).toEqual({ score: 50, correct: 1, total: 2 });
  });

  it('upserts the attempt keyed by quiz+student', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', questions });
    p.quizAttempt.upsert.mockResolvedValue({});
    await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1]);
    expect(p.quizAttempt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { quizId_studentId: { quizId: 'qz1', studentId: 's1' } },
    }));
  });
});

describe('quizzes.service.getQuizResults', () => {
  it('throws 404 when no quiz for the lesson', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    await expect(getQuizResults('l1')).rejects.toMatchObject({ status: 404 });
  });
  it('returns quiz meta and mapped attempt results', async () => {
    p.quiz.findUnique.mockResolvedValue({
      id: 'qz1', createdAt: new Date(), questions,
      attempts: [{ score: 100, takenAt: new Date(), student: { name: 'A', email: 'a@x.com' } }],
    });
    const r = await getQuizResults('l1');
    expect(r.quiz.questionCount).toBe(2);
    expect(r.results[0]).toMatchObject({ studentName: 'A', score: 100 });
  });
});
