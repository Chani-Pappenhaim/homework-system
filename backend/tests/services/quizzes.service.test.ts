import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    quiz: { findUnique: vi.fn(), update: vi.fn() },
    lesson: { findUnique: vi.fn() },
    quizAttempt: { upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const { quizAdd, quizGetJob } = vi.hoisted(() => ({ quizAdd: vi.fn(), quizGetJob: vi.fn() }));
vi.mock('../../src/infrastructure/queues/queues', () => ({
  quizQueue: { add: quizAdd, getJob: quizGetJob },
}));

const { assertLessonAccessMock } = vi.hoisted(() => ({ assertLessonAccessMock: vi.fn() }));
vi.mock('../../src/utils/access', () => ({ assertLessonAccess: assertLessonAccessMock }));

import { prisma } from '../../src/config/prisma';
import {
  getQuiz,
  requestQuizGeneration,
  updateQuizQuestions,
  setQuizPublished,
  validateQuestions,
  submitQuizAttempt,
  getQuizResults,
} from '../../src/services/quizzes.service';

const p = prisma as any;
beforeEach(() => {
  vi.clearAllMocks();
  assertLessonAccessMock.mockResolvedValue(undefined);
  quizGetJob.mockResolvedValue(undefined); // no prior generation job by default
  p.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
});

const questions = [
  { id: 'q1', question: 'A?', options: ['x', 'y'], correctIndex: 0 },
  { id: 'q2', question: 'B?', options: ['x', 'y'], correctIndex: 1 },
];
const draft = { id: 'qz1', questions, published: false };
const live = { id: 'qz1', questions, published: true };

describe('quizzes.service.getQuiz — the teacher owns the draft', () => {
  it('shows the teacher her unpublished draft, with the correct answers', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('ready');
    expect(r.quiz.published).toBe(false);
    expect(r.quiz.questions[0].correctIndex).toBe(0);
  });

  it('hides an unpublished draft from students entirely', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('unavailable');
    expect(r.quiz).toBeUndefined();
    // She must not be able to tell a draft apart from no quiz at all.
    expect(r.message).toContain('עדיין לא פורסם');
  });

  it('gives students a published quiz without the answers', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('ready');
    expect(r.quiz.questions[0]).not.toHaveProperty('correctIndex');
  });

  it('never enqueues generation for a student request', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const r: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(r.status).toBe('unavailable');
    expect(quizAdd).not.toHaveBeenCalled();
    // No lesson lookup is even needed — nothing about the lesson changes her answer.
    expect(p.lesson.findUnique).not.toHaveBeenCalled();
  });

  it('tells the teacher a quiz can be created when the lesson has content', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('none');
    expect(quizAdd).not.toHaveBeenCalled(); // reading the page must not bill an AI call
  });

  it('tells the teacher what is missing when the lesson has no content', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '   ' });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('unavailable');
    expect(r.message).toContain('הוסיפי תוכן');
  });

  it('reports generation still running', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('active'), remove: vi.fn() });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('generating');
  });

  it('reports a failed generation to the teacher with its reason, and clears the job', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const remove = vi.fn().mockResolvedValue(undefined);
    quizGetJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('failed'),
      failedReason: 'Gemini API error: 404',
      remove,
    });
    const r: any = await getQuiz('l1', 'admin', 'ADMIN');
    expect(r.status).toBe('failed');
    expect(r.message).toContain('Gemini API error: 404');
    expect(remove).toHaveBeenCalled();
  });

  it('throws 404 when the lesson does not exist', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue(null);
    await expect(getQuiz('l1', 'admin', 'ADMIN')).rejects.toMatchObject({ status: 404 });
  });
});

describe('quizzes.service.requestQuizGeneration', () => {
  it('enqueues a generation job with a BullMQ-legal id', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const r = await requestQuizGeneration('l1', 'ADMIN');
    expect(r).toEqual({ status: 'generating' });
    expect(quizAdd).toHaveBeenCalledWith(
      'generate',
      { lessonId: 'l1', lessonContent: '# content' },
      { jobId: 'quiz-l1' },
    );
    const jobId: string = quizAdd.mock.calls[0][2].jobId;
    // BullMQ rejects a custom id containing ':' unless it has exactly 3 parts.
    expect(jobId.includes(':') && jobId.split(':').length !== 3).toBe(false);
  });

  it('refuses to overwrite an existing quiz', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    await expect(requestQuizGeneration('l1', 'ADMIN')).rejects.toMatchObject({ status: 409 });
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('refuses when the lesson has no content to work from', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: null });
    await expect(requestQuizGeneration('l1', 'ADMIN')).rejects.toMatchObject({ status: 409 });
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('does not bill a second call while one is already running', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('active'), remove: vi.fn() });
    const r = await requestQuizGeneration('l1', 'ADMIN');
    expect(r).toEqual({ status: 'generating' });
    expect(quizAdd).not.toHaveBeenCalled();
  });

  it('clears a finished job before re-adding, so a retry is not swallowed', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    const remove = vi.fn().mockResolvedValue(undefined);
    quizGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed'), remove });
    await requestQuizGeneration('l1', 'ADMIN');
    expect(remove).toHaveBeenCalled();
    expect(quizAdd).toHaveBeenCalled();
  });

  it('surfaces a queue fault as 502 rather than letting it escape as a 500', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', contentMd: '# content' });
    quizAdd.mockRejectedValueOnce(new Error('connect ECONNREFUSED redis:6379'));
    await expect(requestQuizGeneration('l1', 'ADMIN')).rejects.toMatchObject({ status: 502 });
  });
});

describe('quizzes.service.validateQuestions', () => {
  const ok = { id: '1', question: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 2 };

  it('accepts a well-formed question and trims it', () => {
    const r = validateQuestions([{ ...ok, question: '  Q?  ', options: [' a ', 'b', 'c', 'd'] }]);
    expect(r[0].question).toBe('Q?');
    expect(r[0].options[0]).toBe('a');
  });

  it.each([
    ['an empty list', []],
    ['blank question text', [{ ...ok, question: '   ' }]],
    ['fewer than two options', [{ ...ok, options: ['only'] }]],
    ['a blank option', [{ ...ok, options: ['a', '  ', 'c', 'd'] }]],
    ['correctIndex out of range', [{ ...ok, correctIndex: 9 }]],
    ['a non-integer correctIndex', [{ ...ok, correctIndex: 1.5 }]],
    ['a missing correctIndex', [{ id: '1', question: 'Q?', options: ['a', 'b'] }]],
  ])('rejects %s', (_label, input) => {
    expect(() => validateQuestions(input as any)).toThrow();
  });

  it('renumbers ids so they stay unique as React keys', () => {
    const r = validateQuestions([{ ...ok, id: undefined }, { ...ok, id: undefined }]);
    expect(new Set(r.map((q) => q.id)).size).toBe(2);
  });
});

describe('quizzes.service.updateQuizQuestions', () => {
  it('saves the edited questions', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    p.quiz.update.mockResolvedValue({ ...draft, questions });
    p.quizAttempt.deleteMany.mockResolvedValue({ count: 0 });

    const r: any = await updateQuizQuestions('l1', questions);
    expect(r.quiz.questionCount).toBe(2);
    expect(p.quiz.update).toHaveBeenCalled();
  });

  it('discards attempts, whose scores refer to questions that no longer exist', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    p.quiz.update.mockResolvedValue({ ...draft, questions });
    p.quizAttempt.deleteMany.mockResolvedValue({ count: 3 });

    await updateQuizQuestions('l1', questions);
    expect(p.quizAttempt.deleteMany).toHaveBeenCalledWith({ where: { quizId: 'qz1' } });
    // Both writes go through one transaction so a half-applied edit is impossible.
    expect(p.$transaction).toHaveBeenCalled();
  });

  it('rejects malformed questions before they reach the database', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    await expect(updateQuizQuestions('l1', [{ question: '', options: [], correctIndex: 0 }]))
      .rejects.toMatchObject({ status: 400 });
    expect(p.quiz.update).not.toHaveBeenCalled();
  });

  it('throws 404 when there is no quiz to edit', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    await expect(updateQuizQuestions('l1', questions)).rejects.toMatchObject({ status: 404 });
  });
});

describe('quizzes.service.setQuizPublished', () => {
  it('publishes a valid draft', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    p.quiz.update.mockResolvedValue(live);
    expect(await setQuizPublished('l1', true)).toEqual({ published: true });
  });

  it('unpublishes back to a draft', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    p.quiz.update.mockResolvedValue(draft);
    expect(await setQuizPublished('l1', false)).toEqual({ published: false });
  });

  it('refuses to publish a malformed quiz onto students', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', published: false, questions: [] });
    await expect(setQuizPublished('l1', true)).rejects.toMatchObject({ status: 400 });
    expect(p.quiz.update).not.toHaveBeenCalled();
  });

  it('still allows unpublishing a malformed quiz — that is the way out of the problem', async () => {
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1', published: true, questions: [] });
    p.quiz.update.mockResolvedValue({ id: 'qz1', published: false, questions: [] });
    expect(await setQuizPublished('l1', false)).toEqual({ published: false });
  });
});

describe('quizzes.service.submitQuizAttempt', () => {
  it('refuses an attempt on an unpublished draft', async () => {
    p.quiz.findUnique.mockResolvedValue(draft);
    await expect(submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1]))
      .rejects.toMatchObject({ status: 409 });
    expect(p.quizAttempt.upsert).not.toHaveBeenCalled();
  });

  it('throws 404 when quiz missing', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    await expect(submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1])).rejects.toMatchObject({ status: 404 });
  });

  it('scores a perfect attempt as 100', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    p.quizAttempt.upsert.mockResolvedValue({});
    const r = await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1]);
    expect(r).toMatchObject({ score: 100, correct: 2, total: 2 });
  });

  it('scores a half-correct attempt as 50', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    p.quizAttempt.upsert.mockResolvedValue({});
    const r = await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 0]);
    expect(r).toMatchObject({ score: 50, correct: 1, total: 2 });
  });

  it('upserts the attempt keyed by quiz+student', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    p.quizAttempt.upsert.mockResolvedValue({});
    await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1]);
    expect(p.quizAttempt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { quizId_studentId: { quizId: 'qz1', studentId: 's1' } },
    }));
  });

  it('returns a per-question review so she can see what she got wrong', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    p.quizAttempt.upsert.mockResolvedValue({});
    // Q1 right, Q2 wrong.
    const r: any = await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 0]);

    expect(r.review).toHaveLength(2);
    expect(r.review[0]).toMatchObject({
      id: 'q1', question: 'A?', correctIndex: 0, selectedIndex: 0, isCorrect: true,
    });
    expect(r.review[1]).toMatchObject({
      id: 'q2', question: 'B?', correctIndex: 1, selectedIndex: 0, isCorrect: false,
    });
    // The right answer to the one she missed has to be in there, or the review
    // tells her nothing she did not already know.
    expect(r.review[1].options[r.review[1].correctIndex]).toBe('y');
  });

  it('reveals the answers only in the attempt result, never in a student GET', async () => {
    p.quiz.findUnique.mockResolvedValue(live);
    p.quizAttempt.upsert.mockResolvedValue({});

    const read: any = await getQuiz('l1', 's1', 'STUDENT');
    expect(read.quiz.questions[0]).not.toHaveProperty('correctIndex');

    const answered: any = await submitQuizAttempt('l1', 's1', 'STUDENT', [0, 1]);
    expect(answered.review[0]).toHaveProperty('correctIndex');
  });
});

describe('quizzes.service.getQuizResults', () => {
  it('throws 404 when no quiz for the lesson', async () => {
    p.quiz.findUnique.mockResolvedValue(null);
    await expect(getQuizResults('l1')).rejects.toMatchObject({ status: 404 });
  });

  it('returns quiz meta, its published state and mapped attempt results', async () => {
    p.quiz.findUnique.mockResolvedValue({
      id: 'qz1', createdAt: new Date(), questions, published: true,
      attempts: [{ score: 100, takenAt: new Date(), student: { name: 'A', email: 'a@x.com' } }],
    });
    const r = await getQuizResults('l1');
    expect(r.quiz.questionCount).toBe(2);
    expect(r.quiz.published).toBe(true);
    expect(r.results[0]).toMatchObject({ studentName: 'A', score: 100 });
  });
});
