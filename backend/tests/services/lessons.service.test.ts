import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    lesson: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lessonAccess: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    lessonFile: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    lessonProgress: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));
const { uploadMock, destroyMock, assertLessonAccessMock, assertCourseAccessMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  destroyMock: vi.fn(),
  assertLessonAccessMock: vi.fn(),
  assertCourseAccessMock: vi.fn(),
}));
// Keep the real toFileDTO so the BigInt conversion stays covered.
vi.mock('../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/storage')>()),
  uploadBuffer: uploadMock,
  destroyByUrl: destroyMock,
}));
vi.mock('../../src/utils/access', () => ({
  assertLessonAccess: assertLessonAccessMock,
  assertCourseAccess: assertCourseAccessMock,
}));

import { prisma } from '../../src/config/prisma';
import {
  getLessons,
  getLessonById,
  createLesson,
  updateLesson,
  reorderLessons,
  grantLessonAccess,
  revokeLessonAccess,
  getLessonAccess,
  importMarkdown,
  uploadLessonFile,
  deleteLessonFile,
  deleteLesson,
} from '../../src/services/lessons.service';

const p = prisma as any;
beforeEach(() => {
  vi.clearAllMocks();
  assertLessonAccessMock.mockResolvedValue(undefined);
  assertCourseAccessMock.mockResolvedValue(undefined);
  p.lessonProgress.findUnique.mockResolvedValue(null);
});

describe('lessons.service.getLessons', () => {
  it('adds hidden:false filter for non-admins', async () => {
    p.lesson.findMany.mockResolvedValue([]);
    await getLessons('c1', 's1', 'STUDENT');
    expect(p.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: 'c1', hidden: false },
    }));
  });
  it('does NOT filter hidden for admins', async () => {
    p.lesson.findMany.mockResolvedValue([]);
    await getLessons('c1', 'admin', 'ADMIN');
    expect(p.lesson.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { courseId: 'c1' },
    }));
  });
  it('maps assignmentCount from _count', async () => {
    p.lesson.findMany.mockResolvedValue([
      { id: 'l1', topic: 'T', lessonDate: null, hidden: false, order: 1, githubUrl: null, _count: { assignments: 2 } },
    ]);
    const r = await getLessons('c1', 'admin', 'ADMIN');
    expect(r[0].assignmentCount).toBe(2);
  });
});

describe('lessons.service.getLessonById', () => {
  it('returns null when missing', async () => {
    p.lesson.findUnique.mockResolvedValue(null);
    expect(await getLessonById('l1', 'admin', 'ADMIN')).toBeNull();
  });
  it('checks access for every student read and propagates the refusal', async () => {
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', hidden: false, files: [], assignments: [] });
    assertLessonAccessMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(getLessonById('l1', 's1', 'STUDENT')).rejects.toMatchObject({ status: 403 });
    expect(assertLessonAccessMock).toHaveBeenCalledWith('s1', 'STUDENT', 'l1');
  });
  it('returns lesson with stringified file sizes', async () => {
    p.lesson.findUnique.mockResolvedValue({
      id: 'l1', hidden: false, assignments: [],
      files: [{ id: 'f1', sizeBytes: 1234n }],
    });
    const r: any = await getLessonById('l1', 's1', 'STUDENT');
    expect(r.files[0].sizeBytes).toBe('1234');
  });
});

describe('lessons.service.reorderLessons', () => {
  it('issues one update per lesson with its new order', async () => {
    p.lesson.update.mockResolvedValue({});
    await reorderLessons([{ id: 'l1', order: 2 }, { id: 'l2', order: 1 }]);
    expect(p.lesson.update).toHaveBeenCalledTimes(2);
    expect(p.lesson.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { order: 2 } });
    expect(p.lesson.update).toHaveBeenCalledWith({ where: { id: 'l2' }, data: { order: 1 } });
  });
});

describe('lessons.service lesson access', () => {
  it('grantLessonAccess throws 409 when it already exists', async () => {
    p.lessonAccess.findUnique.mockResolvedValue({ id: 'la1' });
    await expect(grantLessonAccess('l1', 's1')).rejects.toMatchObject({ status: 409 });
    expect(p.lessonAccess.create).not.toHaveBeenCalled();
  });
  it('grantLessonAccess creates the record when new', async () => {
    p.lessonAccess.findUnique.mockResolvedValue(null);
    p.lessonAccess.create.mockResolvedValue({});
    await grantLessonAccess('l1', 's1');
    expect(p.lessonAccess.create).toHaveBeenCalledWith({ data: { studentId: 's1', lessonId: 'l1' } });
  });
  it('revokeLessonAccess deletes the composite record', async () => {
    p.lessonAccess.delete.mockResolvedValue({});
    await revokeLessonAccess('l1', 's1');
    expect(p.lessonAccess.delete).toHaveBeenCalledWith({
      where: { studentId_lessonId: { studentId: 's1', lessonId: 'l1' } },
    });
  });

  it('getLessonAccess returns the mapped students', async () => {
    p.lessonAccess.findMany.mockResolvedValue([{ student: { id: 's1', name: 'A', email: 'a@x.com' } }]);
    const r = await getLessonAccess('l1');
    expect(r).toEqual([{ id: 's1', name: 'A', email: 'a@x.com' }]);
  });
});

describe('lessons.service create / update / markdown', () => {
  it('createLesson converts lessonDate string into a Date', async () => {
    p.lesson.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await createLesson('c1', { topic: 'T', lessonDate: '2026-03-01T00:00:00.000Z' });
    expect(r.courseId).toBe('c1');
    expect(r.lessonDate).toBeInstanceOf(Date);
  });
  it('createLesson omits lessonDate when not given', async () => {
    p.lesson.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await createLesson('c1', { topic: 'T' });
    expect(r).not.toHaveProperty('lessonDate');
  });
  it('updateLesson delegates to prisma.lesson.update', async () => {
    p.lesson.update.mockResolvedValue({ id: 'l1' });
    await updateLesson('l1', { topic: 'New' });
    expect(p.lesson.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { topic: 'New' } });
  });
  it('importMarkdown stores content into contentMd', async () => {
    p.lesson.update.mockResolvedValue({});
    await importMarkdown('l1', '# hi');
    expect(p.lesson.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { contentMd: '# hi' } });
  });
});

describe('lessons.service file upload/delete', () => {
  it('uploadLessonFile stores the upload result', async () => {
    uploadMock.mockResolvedValue({ url: 'https://cdn/x.pdf', bytes: 99, resourceType: 'image', publicId: 'p' });
    p.lessonFile.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await uploadLessonFile('l1', Buffer.from('x'), 'x.pdf', 'application/pdf');
    expect(r).toMatchObject({ lessonId: 'l1', name: 'x.pdf', url: 'https://cdn/x.pdf' });
  });

  it('uploadLessonFile uses the given display name over the original filename', async () => {
    uploadMock.mockResolvedValue({ url: 'https://cdn/x.pdf', bytes: 99, resourceType: 'image', publicId: 'p' });
    p.lessonFile.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await uploadLessonFile('l1', Buffer.from('x'), 'x.pdf', 'application/pdf', 'תרגיל בית');
    expect(r.name).toBe('תרגיל בית');
  });

  it('uploadLessonFile stringifies sizeBytes so the response cannot throw on BigInt', async () => {
    uploadMock.mockResolvedValue({ url: 'https://cdn/x.pdf', bytes: 99, resourceType: 'image', publicId: 'p' });
    p.lessonFile.create.mockResolvedValue({ id: 'f1', lessonId: 'l1', name: 'x.pdf', url: 'https://cdn/x.pdf', sizeBytes: 99n });
    const r: any = await uploadLessonFile('l1', Buffer.from('x'), 'x.pdf', 'application/pdf');
    expect(r.sizeBytes).toBe('99');
    expect(() => JSON.stringify(r)).not.toThrow();
  });
  it('deleteLessonFile throws 404 when file missing', async () => {
    p.lessonFile.findUnique.mockResolvedValue(null);
    await expect(deleteLessonFile('l1', 'f1')).rejects.toMatchObject({ status: 404 });
  });
  it('deleteLessonFile destroys cloudinary asset then deletes the row', async () => {
    p.lessonFile.findUnique.mockResolvedValue({ id: 'f1', url: 'https://res.cloudinary.com/demo/upload/v1/lessons/abc.pdf' });
    destroyMock.mockResolvedValue({});
    p.lessonFile.delete.mockResolvedValue({});
    await deleteLessonFile('l1', 'f1');
    expect(destroyMock).toHaveBeenCalled();
    expect(p.lessonFile.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});

describe('lessons.service.deleteLesson', () => {
  it('throws 404 when the lesson is missing', async () => {
    p.lesson.findUnique.mockResolvedValue(null);
    await expect(deleteLesson('l1')).rejects.toMatchObject({ status: 404 });
    expect(p.lesson.delete).not.toHaveBeenCalled();
  });

  it('destroys the lesson file assets, then deletes the lesson', async () => {
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', files: [{ url: 'https://cdn/a.pdf' }, { url: 'https://cdn/b.pdf' }] });
    destroyMock.mockResolvedValue({});
    p.lesson.delete.mockResolvedValue({});
    await deleteLesson('l1');
    expect(destroyMock).toHaveBeenCalledTimes(2);
    expect(p.lesson.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });

  it('still deletes the lesson when a storage destroy fails', async () => {
    p.lesson.findUnique.mockResolvedValue({ id: 'l1', files: [{ url: 'https://cdn/a.pdf' }] });
    destroyMock.mockRejectedValue(new Error('cloudinary down'));
    p.lesson.delete.mockResolvedValue({});
    await deleteLesson('l1');
    expect(p.lesson.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });
});
