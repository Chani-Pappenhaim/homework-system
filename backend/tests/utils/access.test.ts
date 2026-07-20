import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    lesson: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    studentGroup: { findFirst: vi.fn() },
    lessonAccess: { findUnique: vi.fn() },
  },
}));

import { prisma } from '../../src/config/prisma';
import { assertLessonAccess, assertCourseAccess } from '../../src/utils/access';

const p = prisma as any;
beforeEach(() => vi.clearAllMocks());

/** The thrown value carries a numeric `status` the error middleware reads. */
async function status(fn: () => Promise<unknown>): Promise<number | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e: any) {
    return e.status;
  }
}

describe('assertLessonAccess', () => {
  it('lets an ADMIN through without touching the database', async () => {
    await expect(assertLessonAccess('anyone', 'ADMIN', 'l1')).resolves.toBeUndefined();
    expect(p.lesson.findUnique).not.toHaveBeenCalled();
  });

  it('throws 404 when the lesson does not exist', async () => {
    p.lesson.findUnique.mockResolvedValue(null);
    expect(await status(() => assertLessonAccess('s1', 'STUDENT', 'missing'))).toBe(404);
  });

  it('throws 403 when the lesson is hidden', async () => {
    p.lesson.findUnique.mockResolvedValue({ hidden: true, course: { groupId: 'g1', hidden: false } });
    expect(await status(() => assertLessonAccess('s1', 'STUDENT', 'l1'))).toBe(403);
  });

  it('throws 403 when the parent course is hidden', async () => {
    p.lesson.findUnique.mockResolvedValue({ hidden: false, course: { groupId: 'g1', hidden: true } });
    expect(await status(() => assertLessonAccess('s1', 'STUDENT', 'l1'))).toBe(403);
  });

  it('allows a student in the course group', async () => {
    p.lesson.findUnique.mockResolvedValue({ hidden: false, course: { groupId: 'g1', hidden: false } });
    p.studentGroup.findFirst.mockResolvedValue({ id: 'sg1' });
    await expect(assertLessonAccess('s1', 'STUDENT', 'l1')).resolves.toBeUndefined();
    // Group membership is enough — no need to look at per-lesson grants.
    expect(p.lessonAccess.findUnique).not.toHaveBeenCalled();
  });

  it('allows a student outside the group who holds a lesson-access grant', async () => {
    p.lesson.findUnique.mockResolvedValue({ hidden: false, course: { groupId: 'g1', hidden: false } });
    p.studentGroup.findFirst.mockResolvedValue(null);
    p.lessonAccess.findUnique.mockResolvedValue({ studentId: 's1', lessonId: 'l1' });
    await expect(assertLessonAccess('s1', 'STUDENT', 'l1')).resolves.toBeUndefined();
  });

  it('throws 403 for a student with neither group membership nor a grant', async () => {
    p.lesson.findUnique.mockResolvedValue({ hidden: false, course: { groupId: 'g1', hidden: false } });
    p.studentGroup.findFirst.mockResolvedValue(null);
    p.lessonAccess.findUnique.mockResolvedValue(null);
    expect(await status(() => assertLessonAccess('s1', 'STUDENT', 'l1'))).toBe(403);
  });
});

describe('assertCourseAccess', () => {
  it('lets an ADMIN through without touching the database', async () => {
    await expect(assertCourseAccess('anyone', 'ADMIN', 'c1')).resolves.toBeUndefined();
    expect(p.course.findUnique).not.toHaveBeenCalled();
  });

  it('throws 404 when the course does not exist', async () => {
    p.course.findUnique.mockResolvedValue(null);
    expect(await status(() => assertCourseAccess('s1', 'STUDENT', 'missing'))).toBe(404);
  });

  it('throws 403 when the course is hidden', async () => {
    p.course.findUnique.mockResolvedValue({ groupId: 'g1', hidden: true });
    expect(await status(() => assertCourseAccess('s1', 'STUDENT', 'c1'))).toBe(403);
  });

  it('allows a student in the course group', async () => {
    p.course.findUnique.mockResolvedValue({ groupId: 'g1', hidden: false });
    p.studentGroup.findFirst.mockResolvedValue({ id: 'sg1' });
    await expect(assertCourseAccess('s1', 'STUDENT', 'c1')).resolves.toBeUndefined();
  });

  it('throws 403 for a student outside the course group', async () => {
    p.course.findUnique.mockResolvedValue({ groupId: 'g1', hidden: false });
    p.studentGroup.findFirst.mockResolvedValue(null);
    expect(await status(() => assertCourseAccess('s1', 'STUDENT', 'c1'))).toBe(403);
  });
});
