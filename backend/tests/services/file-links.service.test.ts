import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    lesson: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    lessonFile: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    courseFile: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from '../../src/config/prisma';
import { listLinkableFiles, linkFile } from '../../src/services/file-links.service';

const p = prisma as any;
const lessonTarget = { kind: 'lesson' as const, id: 'l2' };

beforeEach(() => {
  vi.clearAllMocks();
  p.lesson.findUnique.mockResolvedValue({ files: [{ url: 'https://res/a.pdf' }] });
  p.course.findUnique.mockResolvedValue({ files: [] });
  p.lessonFile.findMany.mockResolvedValue([
    { id: 'lf1', name: 'כבר כאן', url: 'https://res/a.pdf', sizeBytes: 10n, uploadedAt: new Date('2026-10-01'), lesson: { topic: 'שיעור 1', course: { name: 'React' } } },
    { id: 'lf2', name: 'מצגת', url: 'https://res/b.pdf', sizeBytes: 2048n, uploadedAt: new Date('2026-10-05'), lesson: { topic: 'שיעור 2', course: { name: 'React' } } },
    { id: 'lf3', name: 'מצגת (עותק)', url: 'https://res/b.pdf', sizeBytes: 2048n, uploadedAt: new Date('2026-10-02'), lesson: { topic: 'שיעור 3', course: { name: 'React' } } },
  ]);
  p.courseFile.findMany.mockResolvedValue([
    { id: 'cf1', name: 'סילבוס', url: 'https://res/c.pdf', sizeBytes: null, uploadedAt: new Date('2026-10-09'), course: { name: 'Node' } },
  ]);
});

describe('listLinkableFiles', () => {
  it('lists every stored file once, newest first, without those the lesson already shows', async () => {
    const files = await listLinkableFiles(lessonTarget);
    expect(files).toEqual([
      { source: 'course', id: 'cf1', name: 'סילבוס', sizeBytes: null, courseName: 'Node', lessonTopic: null },
      { source: 'lesson', id: 'lf2', name: 'מצגת', sizeBytes: '2048', courseName: 'React', lessonTopic: 'שיעור 2' },
    ]);
  });

  it('refuses a lesson that does not exist', async () => {
    p.lesson.findUnique.mockResolvedValue(null);
    await expect(listLinkableFiles(lessonTarget)).rejects.toMatchObject({ status: 404 });
  });
});

describe('linkFile', () => {
  it('shows the stored file in the lesson too, pointing at the same file', async () => {
    p.courseFile.findUnique.mockResolvedValue({ name: 'סילבוס', url: 'https://res/c.pdf', sizeBytes: 99n });
    p.lessonFile.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
    const file: any = await linkFile(lessonTarget, 'course', 'cf1', 'teacher');
    expect(p.lessonFile.create).toHaveBeenCalledWith({
      data: { lessonId: 'l2', name: 'סילבוס', url: 'https://res/c.pdf', sizeBytes: 99n },
    });
    expect(file).toMatchObject({ id: 'new', name: 'סילבוס', sizeBytes: '99' });
  });

  it('links a lesson file into a course', async () => {
    p.lessonFile.findUnique.mockResolvedValue({ name: 'מצגת', url: 'https://res/b.pdf', sizeBytes: null });
    p.courseFile.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
    await linkFile({ kind: 'course', id: 'c9' }, 'lesson', 'lf2', 'teacher');
    expect(p.courseFile.create.mock.calls[0][0].data).toMatchObject({ courseId: 'c9', url: 'https://res/b.pdf' });
  });

  it('refuses a file the lesson already shows', async () => {
    p.lessonFile.findUnique.mockResolvedValue({ name: 'כבר כאן', url: 'https://res/a.pdf', sizeBytes: null });
    await expect(linkFile(lessonTarget, 'lesson', 'lf1', 'teacher')).rejects.toMatchObject({ status: 409 });
    expect(p.lessonFile.create).not.toHaveBeenCalled();
  });

  it('refuses a file that no longer exists, or a request that names none', async () => {
    p.lessonFile.findUnique.mockResolvedValue(null);
    await expect(linkFile(lessonTarget, 'lesson', 'gone', 'teacher')).rejects.toMatchObject({ status: 404 });
    await expect(linkFile(lessonTarget, 'other', 'x', 'teacher')).rejects.toMatchObject({ status: 400 });
    await expect(linkFile(lessonTarget, 'lesson', '', 'teacher')).rejects.toMatchObject({ status: 400 });
  });
});
