import { describe, it, expect, vi, beforeEach } from 'vitest';

// The worker registers itself with `new Worker(name, processor)` at import time
// and never exports the processor. Capture it from the constructor so we can
// drive it directly.
const { getProcessor, setProcessor } = vi.hoisted(() => {
  let fn: ((job: any) => Promise<unknown>) | undefined;
  return { getProcessor: () => fn!, setProcessor: (f: any) => { fn = f; } };
});

vi.mock('bullmq', () => ({
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
  fetchGithubCode: vi.fn(),
  extractZipCode: vi.fn(),
  extractDocxText: vi.fn(),
  reviewCode: vi.fn(),
}));

import { prisma } from '../../src/config/prisma';
import * as gemini from '../../src/services/gemini.service';
import { registerAiReviewWorker } from '../../src/workers/ai-review.worker';

// Registering the worker constructs the (mocked) BullMQ Worker, which captures
// the processor via setProcessor. The connection is irrelevant under the mock.
registerAiReviewWorker({} as any);

const p = prisma as any;
const run = (submissionId: string, opts?: { attemptsMade?: number; attempts?: number }) =>
  getProcessor()({
    data: { submissionId },
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 1 },
  });

beforeEach(() => vi.clearAllMocks());

describe('ai-review worker', () => {
  it('reviews a GitHub submission and lands on aiStatus "done"', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's1', githubUrl: 'https://github.com/u/r', fileName: null, fileUrl: null,
      assignment: { title: 'Task', aiInstructions: 'be strict' }, student: {},
    });
    (gemini.fetchGithubCode as any).mockResolvedValue('const x = 1;');
    (gemini.reviewCode as any).mockResolvedValue({ score: 88, codeReview: 'cr', verbalReview: 'vr' });

    await run('s1');

    expect(gemini.fetchGithubCode).toHaveBeenCalledWith('https://github.com/u/r');
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
    (gemini.extractZipCode as any).mockReturnValue('zipped code');
    (gemini.reviewCode as any).mockResolvedValue({ score: 70, codeReview: 'c', verbalReview: 'v' });
    // downloadFile uses global fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));

    await run('s2');

    expect(gemini.extractZipCode).toHaveBeenCalled();
    expect(p.submission.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiStatus: 'done' }),
    }));
    vi.unstubAllGlobals();
  });

  it('sets aiStatus "error" on the final attempt for an unsupported submission', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's3', githubUrl: null, fileName: 'notes.txt', fileUrl: 'https://c/notes.txt',
      assignment: { title: 'T' }, student: {},
    });

    // Final attempt (attemptsMade+1 >= attempts) → should mark error, then rethrow.
    await expect(run('s3', { attemptsMade: 0, attempts: 1 })).rejects.toThrow(/Unsupported/);
    expect(p.submission.update).toHaveBeenCalledWith({ where: { id: 's3' }, data: { aiStatus: 'error' } });
  });

  it('leaves the status alone on a non-final attempt so a retry can still succeed', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 's4', githubUrl: null, fileName: 'notes.txt', fileUrl: 'https://c/notes.txt',
      assignment: { title: 'T' }, student: {},
    });

    // attemptsMade+1 (2) < attempts (3) → not final → must NOT write 'error'.
    await expect(run('s4', { attemptsMade: 1, attempts: 3 })).rejects.toThrow();
    expect(p.submission.update).not.toHaveBeenCalled();
  });
});
