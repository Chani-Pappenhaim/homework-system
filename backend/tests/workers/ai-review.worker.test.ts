import { describe, it, expect, vi, beforeEach } from 'vitest';

// The worker registers itself with `new Worker(name, processor)` at import time
// and never exports the processor. Capture it from the constructor so we can
// drive it directly.
const { getProcessor, setProcessor } = vi.hoisted(() => {
  let fn: ((job: any) => Promise<unknown>) | undefined;
  return { getProcessor: () => fn!, setProcessor: (f: any) => { fn = f; } };
});

vi.mock('bullmq', () => ({
  UnrecoverableError: class extends Error {},
  Worker: class {
    constructor(_name: string, processor: any) { setProcessor(processor); }
    on() {}
  },
}));
vi.mock('../../src/config/prisma', () => ({
  // update() must return a promise: the worker's error path calls .catch() on it,
  // mirroring the real Prisma client (a bare vi.fn() returns undefined and throws).
  prisma: { submission: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}));
vi.mock('../../src/services/gemini.service', () => ({
  reviewCode: vi.fn(),
}));
vi.mock('../../src/utils/code-extraction', () => ({
  fetchGithubCode: vi.fn(),
  extractZipCode: vi.fn(),
  extractDocxText: vi.fn(),
}));

import { prisma } from '../../src/config/prisma';
import * as gemini from '../../src/services/gemini.service';
import * as codeExtraction from '../../src/utils/code-extraction';
import { registerAiReviewWorker } from '../../src/workers/ai-review.worker';
import { AI_REVIEW_GENERIC_ERROR } from '../../src/utils/ai-review-errors';

// Registering the worker constructs the (mocked) BullMQ Worker, which captures
// the processor via setProcessor. The connection is irrelevant under the mock.
registerAiReviewWorker({} as any);

const p = prisma as any;
const run = (submissionId: string, opts?: { attemptsMade?: number; attempts?: number; byTeacher?: boolean }) =>
  getProcessor()({
    data: { submissionId, byTeacher: opts?.byTeacher },
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 1 },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ai-review worker', () => {
  it('reviews a GitHub submission and lands on aiStatus "done"', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's1', githubUrl: 'https://github.com/u/r', fileName: null, fileUrl: null,
      assignment: { title: 'Task', aiInstructions: 'be strict' }, student: {},
    });
    (codeExtraction.fetchGithubCode as any).mockResolvedValue('const x = 1;');
    (gemini.reviewCode as any).mockResolvedValue({ score: 88, codeReview: 'cr', verbalReview: 'vr' });

    await run('s1');

    expect(codeExtraction.fetchGithubCode).toHaveBeenCalledWith('https://github.com/u/r');
    expect(p.submission.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 's1' },
      data: expect.objectContaining({ aiStatus: 'done', aiScore: 88, aiCodeReview: 'cr' }),
    }));
  });

  it('routes a .zip file through the zip extractor', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's2', githubUrl: null, fileName: 'work.zip', fileUrl: 'https://c/work.zip',
      assignment: { title: 'T' }, student: {},
    });
    (codeExtraction.extractZipCode as any).mockReturnValue('zipped code');
    (gemini.reviewCode as any).mockResolvedValue({ score: 70, codeReview: 'c', verbalReview: 'v' });
    // downloadFile uses global fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));

    await run('s2');

    expect(codeExtraction.extractZipCode).toHaveBeenCalled();
    expect(p.submission.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiStatus: 'done' }),
    }));
    vi.unstubAllGlobals();
  });

  const errorData = () => p.submission.update.mock.calls.at(-1)[0].data;

  it('fails an unsupported submission at once, without retries, with a message the student can act on', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's3', githubUrl: null, fileName: 'notes.txt', fileUrl: 'https://c/notes.txt',
      assignment: { title: 'T' }, student: {},
    });

    // Not the final attempt — but retrying can't help, so it is marked failed now.
    await expect(run('s3', { attemptsMade: 0, attempts: 3 })).rejects.toThrow(/Unsupported/);
    expect(errorData()).toEqual({ aiStatus: 'error', aiError: expect.stringContaining('ZIP') });
  });

  it('tells the student when the GitHub repo is missing or private', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's6', githubUrl: 'https://github.com/u/nope', fileName: null, fileUrl: null,
      assignment: { title: 'T' }, student: {},
    });
    (codeExtraction.fetchGithubCode as any).mockRejectedValue(Object.assign(new Error('GitHub API error: 404'), { status: 404 }));

    await expect(run('s6', { attempts: 3 })).rejects.toThrow(/404/);
    expect(errorData()).toEqual({ aiStatus: 'error', aiError: expect.stringContaining('הריפו לא נמצא') });
  });

  it('does not send an empty submission to the AI', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's7', githubUrl: 'https://github.com/u/r', fileName: null, fileUrl: null,
      assignment: { title: 'T' }, student: {},
    });
    (codeExtraction.fetchGithubCode as any).mockResolvedValue('  ');

    await expect(run('s7', { attempts: 3 })).rejects.toThrow(/No reviewable content/);
    expect(gemini.reviewCode).not.toHaveBeenCalled();
    expect(errorData().aiError).toContain('לא נמצא בהגשה קוד');
  });

  it('leaves the status alone on a non-final attempt of a transient failure so a retry can still succeed', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's4', githubUrl: 'https://github.com/u/r', fileName: null, fileUrl: null,
      assignment: { title: 'T' }, student: {},
    });
    (codeExtraction.fetchGithubCode as any).mockResolvedValue('code');
    (gemini.reviewCode as any).mockRejectedValue(new Error('Gemini API error: 503'));

    // attemptsMade+1 (2) < attempts (3) → not final → must NOT write 'error'.
    await expect(run('s4', { attemptsMade: 1, attempts: 3 })).rejects.toThrow();
    expect(p.submission.update).not.toHaveBeenCalled();

    // The final attempt shows a generic message — the Gemini detail stays in the logs.
    await expect(run('s4', { attemptsMade: 2, attempts: 3 })).rejects.toThrow();
    expect(errorData()).toEqual({ aiStatus: 'error', aiError: AI_REVIEW_GENERIC_ERROR });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('submission s4'), 'Gemini API error: 503');
  });
});

describe('ai-review worker — attempts and the assignment description', () => {
  const githubSubmission = {
    id: 's5', githubUrl: 'https://github.com/u/r', fileName: null, fileUrl: null,
    assignment: { title: 'Task', aiInstructions: 'strict', description: 'Build a todo list' }, student: {},
  };

  beforeEach(() => {
    p.submission.findUnique.mockResolvedValue(githubSubmission);
    (codeExtraction.fetchGithubCode as any).mockResolvedValue('code');
    (gemini.reviewCode as any).mockResolvedValue({ score: 90, codeReview: 'c', verbalReview: 'v' });
  });

  it('a student\'s request uses up one of her attempts', async () => {
    await run('s5');
    const data = p.submission.update.mock.calls.at(-1)[0].data;
    expect(data.aiReviewCount).toEqual({ increment: 1 });
  });

  it('a teacher\'s re-run does not', async () => {
    await run('s5', { byTeacher: true });
    const data = p.submission.update.mock.calls.at(-1)[0].data;
    expect(data).not.toHaveProperty('aiReviewCount');
    expect(data.aiStatus).toBe('done');
  });

  it('gives the AI the assignment description', async () => {
    await run('s5');
    expect(gemini.reviewCode).toHaveBeenCalledWith('code', 'Task', 'strict', 'Build a todo list');
  });
});
