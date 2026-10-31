import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    assignment: { findMany: vi.fn() },
    studentGroup: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/config/prisma';
import { findRecentlyDueAssignments, buildDeadlineReportRows } from '../../src/services/deadline-report.service';

const p = prisma as any;
beforeEach(() => vi.clearAllMocks());

describe('deadline-report.service.findRecentlyDueAssignments', () => {
  it('reports only on mandatory assignments the students can see, due inside the window', async () => {
    p.assignment.findMany.mockResolvedValue([]);
    const now = new Date('2026-10-31T12:00:00Z');
    await findRecentlyDueAssignments(now, 60_000);
    expect(p.assignment.findMany.mock.calls[0][0].where).toEqual({
      hidden: false, optional: false,
      deadline: { lt: now, gt: new Date('2026-10-31T11:59:00Z') },
    });
  });
});

describe('deadline-report.service.buildDeadlineReportRows', () => {
  it('marks each student of the group as submitted, late or missing', async () => {
    p.studentGroup.findMany.mockResolvedValue([
      { student: { id: 's1', name: 'A' } }, { student: { id: 's2', name: 'B' } }, { student: { id: 's3', name: 'C' } },
    ]);
    const at = new Date('2026-10-30T10:00:00Z');
    const rows = await buildDeadlineReportRows({
      lesson: { course: { groupId: 'g1' } },
      submissions: [{ studentId: 's1', submittedAt: at, isLate: false }, { studentId: 's2', submittedAt: at, isLate: true }],
    } as any);
    expect(rows.map((r) => r.status)).toEqual(['submitted', 'late', 'missing']);
  });
});
