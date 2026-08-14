import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    quiz: { findUnique: vi.fn() },
    lesson: { findUnique: vi.fn() },
    quizAttempt: { upsert: vi.fn() },
  },
}));

const { quizAdd, quizGetJob } = vi.hoisted(() => ({ quizAdd: vi.fn(), quizGetJob: vi.fn() }));
vi.mock('../../src/infrastructure/queues/queues', () => ({
  quizQueue: { add: quizAdd, getJob: quizGetJob },
}));

const { assertLessonAccessMock } = vi.hoisted(() => ({ assertLessonAccessMock: vi.fn() }));
vi.mock('../../src/utils/access', () => ({ assertLessonAccess: assertLessonAccessMock }));

import { prisma } from '../../src/config/prisma';
import { getQuiz, submitQuizAttempt, getQuizResults } from '../../src/services/quizzes.service';

const p = prisma as any;
beforeEach(() => {
  vi.clearAllMocks();
  assertLessonAccessMock.mockResolvedValue(undefined);
  quizGetJob.mockResolvedValue(undefined); // no prior generation job by default
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
      { jobId: 'quiz-l1' },   // dedup — polling must not bill a Gemini call per request
    );
  });

  it('uses a job id BullMQ accepts — a colon made every add() throw', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    await getQuiz('l1', 's1', 'STUDENT');
    const jobId: string = quizAdd.mock.calls[0][2].jobId;
    // BullMQ rejects a custom id containing ':' unless it has exactly 3 parts.
    expect(jobId.includes(':') && jobId.split(':').length !== 3).toBe(false);
  });

  it('reports a queue fault as "failed" instead of letting it escape as a 500', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizAdd.mockRejectedValueOnce(new Error('Custom Id cannot contain :'));
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('failed');
    expect(r.message).toContain('Custom Id cannot contain');
  });

  it('hides a queue fault\'s technical detail from students', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizAdd.mockRejectedValueOnce(new Error('connect ECONNREFUSED redis:6379'));
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('failed');
    expect(r.message).not.toContain('ECONNREFUSED');
  });

  it('returns "unavailable" with a student-facing message when the lesson has no content', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: null });
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('unavailable');
    expect(r.message).toContain('פני למורה');
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('treats whitespace-only content as no content', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '   \n  ' });
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('unavailable');
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('tells the teacher what to do instead of telling her to ask the teacher', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: null });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('unavailable');
    expect(r.message).toContain('הוסיפי תוכן');
    expect(r.message).not.toContain('פני למורה');
  });

  it('throws 404 when the lesson does not exist', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue(null);
    await expect(getQuiz('l1', 's1', 'STUDENT')).rejects.toMatchObject({ status: 404 });
  });

  it('reports a failed job, removes it so the next request retries, and hides the cause from students', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const remove = vi.fn().mockResolvedValue(undefined);
    quizGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('failed'),
      failedReason: 'Gemini API error: 404 — the model "gemini-2.0-flash" is not available.',
      remove,
    });

    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('failed');
    expect(r.message).not.toContain('gemini-2.0-flash');
    expect(remove).toHaveBeenCalled();
    // The retry is the *next* request; this one only reports and clears.
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('gives the teacher the technical failure reason', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('failed'),
      failedReason: 'Gemini API error: 404 model not available',
      remove: vi.fn().mockResolvedValue(undefined),
    });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.message).toContain('Gemini API error: 404');
  });

  it('does not re-enqueue while a job is still waiting', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('waiting'), remove: vi.fn() });
    const r = await getQuiz('l1', 's1', 'STUDENT');
    expect(r).toEqual({ status: 'generating' });
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('re-enqueues when a completed job left no quiz behind', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const remove = vi.fn().mockResolvedValue(undefined);
    quizGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('completed'), remove });
    const r = await getQuiz('l1', 's1', 'STUDENT');
    expect(r).toEqual({ status: 'generating' });
    expect(remove).toHaveBeenCalled();
    expect(quizAdd).toHaveBeenCalled();
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
