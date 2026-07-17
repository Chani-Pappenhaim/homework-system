import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    course: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    studentGroup: { findFirst: vi.fn() },
    lessonAccess: { findUnique: vi.fn() },
    courseFile: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
    courseLink: { create: vi.fn(), delete: vi.fn() },
    lessonProgress: { findMany: vi.fn() },
  },
}));

const { uploadMock, destroyMock, assertCourseAccessMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  destroyMock: vi.fn(),
  assertCourseAccessMock: vi.fn(),
}));
// Keep the real toFileDTO — it is what converts BigInt sizes and must stay exercised.
vi.mock('../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/storage')>()),
  uploadBuffer: uploadMock,
  destroyByUrl: destroyMock,
}));
vi.mock('../../src/utils/access', () => ({
  assertCourseAccess: assertCourseAccessMock,
}));

import { prisma } from '../../src/config/prisma';
import {
  getCoursesForUser,
  getCourseById,
  copyCourse,
  createCourse,
  updateCourse,
  addCourseLink,
  deleteCourseLink,
  uploadCourseFile,
  deleteCourseFile,
} from '../../src/services/courses.service';

const p = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  assertCourseAccessMock.mockResolvedValue(undefined);
  p.lessonProgress.findMany.mockResolvedValue([]);
});

describe('courses.service.getCoursesForUser', () => {
  it('ADMIN gets all courses unfiltered', async () => {
    p.course.findMany.mockResolvedValue([
      { id: 'c1', name: 'C1', group: { name: 'G' }, _count: { lessons: 3 } },
    ]);
    const r = await getCoursesForUser('admin', 'ADMIN');
    expect(p.course.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ where: expect.anything() }));
    expect(r[0]).toMatchObject({ id: 'c1', groupName: 'G', lessonCount: 3 });
  });

  it('STUDENT only gets non-hidden courses in their groups', async () => {
    p.user.findUnique.mockResolvedValue({ studentGroups: [{ groupId: 'g1' }] });
    p.course.findMany.mockResolvedValue([]);
    await getCoursesForUser('s1', 'STUDENT');
    expect(p.course.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { hidden: false, groupId: { in: ['g1'] } },
    }));
  });

  it('STUDENT gets completedLessons counted per course', async () => {
    p.user.findUnique.mockResolvedValue({ studentGroups: [{ groupId: 'g1' }] });
    p.course.findMany.mockResolvedValue([
      { id: 'c1', name: 'C1', group: { name: 'G' }, _count: { lessons: 3 } },
      { id: 'c2', name: 'C2', group: { name: 'G' }, _count: { lessons: 2 } },
    ]);
    p.lessonProgress.findMany.mockResolvedValue([
      { lesson: { courseId: 'c1' } },
      { lesson: { courseId: 'c1' } },
      { lesson: { courseId: 'c2' } },
    ]);
    const r = await getCoursesForUser('s1', 'STUDENT');
    expect(r[0]).toMatchObject({ id: 'c1', lessonCount: 3, completedLessons: 2 });
    expect(r[1]).toMatchObject({ id: 'c2', lessonCount: 2, completedLessons: 1 });
  });

  it('STUDENT lessonCount excludes hidden lessons so the meter can reach 100%', async () => {
    p.user.findUnique.mockResolvedValue({ studentGroups: [{ groupId: 'g1' }] });
    p.course.findMany.mockResolvedValue([]);
    await getCoursesForUser('s1', 'STUDENT');
    expect(p.course.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        _count: { select: { lessons: { where: { hidden: false } } } },
      }),
    }));
  });
});

describe('courses.service.getCourseById', () => {
  const course = () => ({
    id: 'c1', name: 'C', year: '2026', description: null, imageUrl: null, hidden: false,
    groupId: 'g1', links: [], files: [],
    lessons: [
      { id: 'l1', topic: 'A', lessonDate: null, hidden: false, order: 1 },
      { id: 'l2', topic: 'B', lessonDate: null, hidden: true, order: 2 },
    ],
    group: { name: 'G' }, _count: { lessons: 2 },
  });

  it('returns null when course missing', async () => {
    p.course.findUnique.mockResolvedValue(null);
    expect(await getCourseById('c1', 's1', 'ADMIN')).toBeNull();
  });

  it('ADMIN sees hidden lessons too', async () => {
    p.course.findUnique.mockResolvedValue(course());
    const r = await getCourseById('c1', 'admin', 'ADMIN');
    expect(r!.lessons).toHaveLength(2);
  });

  it('STUDENT with group access sees only visible lessons', async () => {
    p.course.findUnique.mockResolvedValue(course());
    p.studentGroup.findFirst.mockResolvedValue({ id: 'sg' });
    const r = await getCourseById('c1', 's1', 'STUDENT');
    expect(r!.lessons).toHaveLength(1);
    expect(r!.lessons[0].id).toBe('l1');
  });

  it('throws 403 for a student without access', async () => {
    p.course.findUnique.mockResolvedValue(course());
    assertCourseAccessMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(getCourseById('c1', 's1', 'STUDENT')).rejects.toMatchObject({ status: 403 });
  });
});

describe('courses.service.copyCourse', () => {
  it('throws 404 when source course not found', async () => {
    p.course.findUnique.mockResolvedValue(null);
    await expect(copyCourse('c1', 'g2')).rejects.toMatchObject({ status: 404 });
  });

  it('clones course into target group with nested lessons/links/files, unhidden', async () => {
    p.course.findUnique.mockResolvedValue({
      id: 'c1', name: 'Src', year: '2026', description: 'd', imageUrl: null,
      links: [{ id: 'lk1', courseId: 'c1', label: 'L', url: 'u', order: 0 }],
      files: [{ id: 'f1', courseId: 'c1', uploadedAt: new Date(), name: 'n', url: 'u', sizeBytes: 1n }],
      lessons: [{
        id: 'l1', courseId: 'c1', createdAt: new Date(), topic: 'T', hidden: true, order: 1,
        files: [], assignments: [{ id: 'a1', lessonId: 'l1', createdAt: new Date(), title: 'A' }],
      }],
    });
    p.course.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'c2', ...data, group: { name: 'G2' }, _count: { lessons: 1 } }));
    const r = await copyCourse('c1', 'g2');
    const createArg = p.course.create.mock.calls[0][0].data;
    expect(createArg.groupId).toBe('g2');
    expect(createArg.hidden).toBe(false);
    // nested lesson is forced unhidden and strips ids
    expect(createArg.lessons.create[0].hidden).toBe(false);
    expect(createArg.lessons.create[0]).not.toHaveProperty('id');
    expect(r).toMatchObject({ id: 'c2', groupName: 'G2' });
  });
});

describe('courses.service create/update + links + files', () => {
  it('createCourse returns a DTO', async () => {
    p.course.create.mockResolvedValue({ id: 'c1', name: 'C', group: { name: 'G' }, _count: { lessons: 0 } });
    const r = await createCourse({ name: 'C', groupId: 'g1' });
    expect(r).toMatchObject({ id: 'c1', groupName: 'G', lessonCount: 0 });
  });
  it('updateCourse returns a DTO', async () => {
    p.course.update.mockResolvedValue({ id: 'c1', name: 'C2', group: { name: 'G' }, _count: { lessons: 2 } });
    const r = await updateCourse('c1', { name: 'C2' });
    expect(r).toMatchObject({ id: 'c1', name: 'C2', lessonCount: 2 });
  });
  it('addCourseLink creates the link', async () => {
    p.courseLink.create.mockResolvedValue({ id: 'lk1' });
    await addCourseLink('c1', 'Label', 'http://u', 3);
    expect(p.courseLink.create).toHaveBeenCalledWith({ data: { courseId: 'c1', label: 'Label', url: 'http://u', order: 3 } });
  });
  it('deleteCourseLink deletes by composite id', async () => {
    p.courseLink.delete.mockResolvedValue({});
    await deleteCourseLink('c1', 'lk1');
    expect(p.courseLink.delete).toHaveBeenCalledWith({ where: { id: 'lk1', courseId: 'c1' } });
  });
  it('uploadCourseFile uploads then stores the record', async () => {
    uploadMock.mockResolvedValue({ url: 'https://cdn/x.pdf', bytes: 42, resourceType: 'image', publicId: 'p' });
    p.courseFile.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await uploadCourseFile('c1', Buffer.from('x'), 'x.pdf', 'application/pdf');
    expect(r).toMatchObject({ courseId: 'c1', url: 'https://cdn/x.pdf' });
  });

  it('uploadCourseFile returns sizeBytes as a string so JSON.stringify cannot throw on BigInt', async () => {
    uploadMock.mockResolvedValue({ url: 'https://cdn/x.pdf', bytes: 42, resourceType: 'image', publicId: 'p' });
    // Prisma hands back a BigInt for sizeBytes; the DTO must stringify it.
    p.courseFile.create.mockResolvedValue({ id: 'f1', courseId: 'c1', name: 'x.pdf', url: 'https://cdn/x.pdf', sizeBytes: 42n });
    const r: any = await uploadCourseFile('c1', Buffer.from('x'), 'x.pdf', 'application/pdf');
    expect(r.sizeBytes).toBe('42');
    expect(() => JSON.stringify(r)).not.toThrow();
  });
  it('deleteCourseFile throws 404 when the file is missing', async () => {
    p.courseFile.findUnique.mockResolvedValue(null);
    await expect(deleteCourseFile('c1', 'f1')).rejects.toMatchObject({ status: 404 });
  });
  it('deleteCourseFile removes the cloudinary asset then the row', async () => {
    p.courseFile.findUnique.mockResolvedValue({ id: 'f1', url: 'https://res.cloudinary.com/demo/upload/v1/courses/abc.pdf' });
    destroyMock.mockResolvedValue({});
    p.courseFile.delete.mockResolvedValue({});
    await deleteCourseFile('c1', 'f1');
    expect(destroyMock).toHaveBeenCalled();
    expect(p.courseFile.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});
