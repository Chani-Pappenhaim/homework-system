import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    submission: { findUnique: vi.fn() },
    grade: { update: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('../../src/infrastructure/queues/queues', () => ({ aiReviewQueue: { add: vi.fn() } }));
const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));
vi.mock('../../src/services/student-notifications.service', () => ({ enqueueStudentEmail: enqueueMock }));
vi.mock('../../src/services/ai-availability', () => ({ assertAiAvailable: vi.fn() }));

import { prisma } from '../../src/config/prisma';
import { approveContentScore, bulkApproveContentScore, unapproveContentScore } from '../../src/services/submission-ai-review.service';

const p = prisma as any;
const submission = (contentApproved: boolean, contentScore: number | null = 80) => ({
  id: 's1', student: { name: 'A', email: 'a@x.com' }, assignment: { title: 'T' },
  grade: { contentScore, contentApproved },
});

beforeEach(() => {
  vi.clearAllMocks();
  p.grade.update.mockResolvedValue({ contentScore: 80 });
});

describe('approveContentScore', () => {
  it('records the teacher and mails the student the first time', async () => {
    p.submission.findUnique.mockResolvedValue(submission(false));
    await approveContentScore('s1', 't1');
    expect(p.grade.update.mock.calls[0][0].data).toMatchObject({ contentApproved: true, gradedById: 't1' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('does not mail again when the score was already approved', async () => {
    p.submission.findUnique.mockResolvedValue(submission(true));
    await approveContentScore('s1', 't1');
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('refuses when there is no content score', async () => {
    p.submission.findUnique.mockResolvedValue(submission(false, null));
    await expect(approveContentScore('s1', 't1')).rejects.toMatchObject({ status: 400 });
  });
});

describe('bulkApproveContentScore', () => {
  it('counts the ones it had to skip', async () => {
    p.submission.findUnique.mockResolvedValueOnce(submission(false)).mockResolvedValueOnce(submission(false, null));
    expect(await bulkApproveContentScore(['a', 'b'], 't1')).toEqual({ approved: 1, skipped: 1 });
  });
});

describe('unapproveContentScore', () => {
  it('hides the score again', async () => {
    p.grade.updateMany.mockResolvedValue({ count: 1 });
    await unapproveContentScore('s1');
    expect(p.grade.updateMany).toHaveBeenCalledWith({ where: { submissionId: 's1' }, data: { contentApproved: false } });
  });

  it('reports a submission with no grade', async () => {
    p.grade.updateMany.mockResolvedValue({ count: 0 });
    await expect(unapproveContentScore('s1')).rejects.toMatchObject({ status: 404 });
  });
});
