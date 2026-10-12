import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {},
  Worker: class {
    on() {}
  },
}));
vi.mock('../../src/config/prisma', () => ({
  prisma: {
    lesson: { findUnique: vi.fn() },
    lessonFile: { findMany: vi.fn() },
    quiz: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    quizAttempt: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
// GeminiError stays real: the worker decides retries by its kind and status.
vi.mock('../../src/services/gemini.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/gemini.service')>()),
  generateQuiz: vi.fn(),
}));
vi.mock('../../src/utils/code-extraction', () => ({ extractLessonFiles: vi.fn() }));

import { UnrecoverableError } from 'bullmq';
import { prisma } from '../../src/config/prisma';
import { generateQuiz, GeminiError } from '../../src/services/gemini.service';
import { extractLessonFiles } from '../../src/utils/code-extraction';
import { processQuizJob } from '../../src/workers/quiz.worker';

const p = prisma as any;
const generate = generateQuiz as any;
const extract = extractLessonFiles as any;
const questions = [{ id: '1', question: 'Q?', options: ['a', 'b'], correctIndex: 0 }];

function job(data: Record<string, unknown> = {}, attemptsMade = 0) {
  return {
    data: { lessonId: 'l1', ...data },
    attemptsMade,
    opts: { attempts: 3 },
    progress: undefined as unknown,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as any;
}
const stages = (j: any) => j.updateProgress.mock.calls.map((c: any[]) => c[0].stage);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  p.lesson.findUnique.mockResolvedValue({ contentMd: '# לולאות' });
  p.lessonFile.findMany.mockResolvedValue([]);
  p.quiz.create.mockResolvedValue({});
  p.$transaction.mockImplementation(async (fn: any) => fn(p));
  generate.mockResolvedValue(questions);
});

describe('quiz worker — generation', () => {
  it('generates from the lesson text alone and saves an unpublished draft', async () => {
    const j = job();
    await processQuizJob(j);
    expect(generate).toHaveBeenCalledWith('# לולאות', []);
    expect(p.lessonFile.findMany).not.toHaveBeenCalled();
    expect(p.quiz.create).toHaveBeenCalledWith({
      data: { lessonId: 'l1', questions, sourceFiles: Prisma.DbNull, published: false },
    });
    expect(stages(j)).toEqual(['generating', 'saving']);
  });

  it('reads the lesson files when asked, and records what the quiz was built from', async () => {
    p.lessonFile.findMany.mockResolvedValue([{ name: 'a.pdf' }, { name: 'b.txt' }, { name: 'c.zip' }]);
    const inline = [{ name: 'a.pdf', mimeType: 'application/pdf', data: 'QQ==' }];
    const skipped = [{ name: 'c.zip', reason: 'unsupported' }];
    extract.mockResolvedValue({ text: '--- b.txt ---\nhi', inline, used: ['a.pdf', 'b.txt'], skipped });

    const j = job({ includeFiles: true });
    await processQuizJob(j);

    expect(generate).toHaveBeenCalledWith(expect.stringContaining('--- b.txt ---\nhi'), inline);
    expect(p.quiz.create.mock.calls[0][0].data.sourceFiles).toEqual({ included: ['a.pdf', 'b.txt'], skipped });
    expect(stages(j)).toEqual(['reading-files', 'generating', 'saving']);
  });

  it('skips the reading stage when the lesson has no files', async () => {
    const j = job({ includeFiles: true });
    await processQuizJob(j);
    expect(extract).not.toHaveBeenCalled();
    expect(stages(j)).toEqual(['generating', 'saving']);
  });

  it('retries without the attached files when Gemini refuses them, and says they were left out', async () => {
    p.lessonFile.findMany.mockResolvedValue([{ name: 'scan.pdf' }, { name: 'b.txt' }]);
    extract.mockResolvedValue({
      text: '--- b.txt ---\nhi',
      inline: [{ name: 'scan.pdf', mimeType: 'application/pdf', data: 'QQ==' }],
      used: ['scan.pdf', 'b.txt'],
      skipped: [],
    });
    generate
      .mockRejectedValueOnce(new GeminiError('Gemini API error: 400 bad pdf', 'config', false, 400))
      .mockResolvedValueOnce(questions);

    await processQuizJob(job({ includeFiles: true }));

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]).toEqual([expect.stringContaining('b.txt')]);
    expect(p.quiz.create.mock.calls[0][0].data.sourceFiles).toEqual({
      included: ['b.txt'],
      skipped: [{ name: 'scan.pdf', reason: 'unreadable' }],
    });
  });
});

describe('quiz worker — failures', () => {
  it('does not retry a lesson that has no content', async () => {
    p.lesson.findUnique.mockResolvedValue({ contentMd: '  ' });
    const j = job();
    await expect(processQuizJob(j)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(j.updateProgress).toHaveBeenLastCalledWith(expect.objectContaining({ lastFailure: 'no-content' }));
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not retry an error that will fail the same way again', async () => {
    generate.mockRejectedValue(new GeminiError('Gemini API error: 403', 'config', false, 403));
    const j = job();
    await expect(processQuizJob(j)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(j.updateProgress).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'retrying', lastFailure: 'config' }));
  });

  it('lets BullMQ retry a transient error, recording why for her page', async () => {
    const err = new GeminiError('timed out', 'timeout', true);
    generate.mockRejectedValue(err);
    const j = job();
    await expect(processQuizJob(j)).rejects.toBe(err);
    expect(j.updateProgress).toHaveBeenLastCalledWith(expect.objectContaining({ lastFailure: 'timeout' }));
  });

  it('does not use the no-files fallback on a 400 when nothing was attached', async () => {
    generate.mockRejectedValue(new GeminiError('Gemini API error: 400 API key not valid', 'config', false, 400));
    await expect(processQuizJob(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('carries the previous attempt\'s failure into the next attempt\'s progress', async () => {
    const j = job({}, 1);
    j.progress = { stage: 'retrying', at: 1, lastFailure: 'rate-limit' };
    await processQuizJob(j);
    expect(j.updateProgress.mock.calls[0][0]).toMatchObject({ stage: 'generating', lastFailure: 'rate-limit' });
  });
});

describe('quiz worker — saving', () => {
  it('never overwrites a quiz that appeared while it ran', async () => {
    p.quiz.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x' })
    );
    await expect(processQuizJob(job())).resolves.toBeUndefined();
  });

  it('replaces an unpublished draft and discards attempts on the old questions', async () => {
    p.quiz.updateMany.mockResolvedValue({ count: 1 });
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1' });
    await processQuizJob(job({ replace: true }));
    expect(p.quiz.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { lessonId: 'l1', published: false },
    }));
    expect(p.quizAttempt.deleteMany).toHaveBeenCalledWith({ where: { quizId: 'qz1' } });
    expect(p.quiz.create).not.toHaveBeenCalled();
  });

  it('keeps a quiz that was published during regeneration', async () => {
    p.quiz.updateMany.mockResolvedValue({ count: 0 });
    p.quiz.findUnique.mockResolvedValue({ id: 'qz1' });
    await processQuizJob(job({ replace: true }));
    expect(p.quiz.create).not.toHaveBeenCalled();
    expect(p.quizAttempt.deleteMany).not.toHaveBeenCalled();
  });

  it('creates the quiz if the draft was deleted during regeneration', async () => {
    p.quiz.updateMany.mockResolvedValue({ count: 0 });
    p.quiz.findUnique.mockResolvedValue(null);
    await processQuizJob(job({ replace: true }));
    expect(p.quiz.create).toHaveBeenCalled();
  });
});
