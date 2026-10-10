import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    course: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    studentGroup: { create: vi.fn(), delete: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    group: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

const { releaseMock } = vi.hoisted(() => ({ releaseMock: vi.fn() }));
vi.mock('../../src/utils/file-refs', () => ({ releaseFileUrls: releaseMock }));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed-pw'), compare: vi.fn() },
}));

// The verification email is auth.service's concern, covered by its own tests.
const { sendVerificationMock } = vi.hoisted(() => ({ sendVerificationMock: vi.fn() }));
vi.mock('../../src/services/auth.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/auth.service')>()),
  sendEmailVerification: sendVerificationMock,
}));

const { emailAdd } = vi.hoisted(() => ({ emailAdd: vi.fn() }));
vi.mock('../../src/infrastructure/queues/queues', () => ({
  emailQueue: { add: emailAdd },
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import {
  addStudent,
  updateStudent,
  removeStudent,
  resetStudentPassword,
  createGroup,
  updateGroup,
  getGroups,
  getGroupById,
  importStudents,
  deleteGroup,
  createStudentAccount,
} from '../../src/services/groups.service';

const p = prisma as any;

async function xlsxBuffer(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('S');
  sheet.addRow(['Name', 'Email', 'GitHub']);
  rows.forEach((r) => sheet.addRow(r));
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  p.group.findUnique.mockResolvedValue({ emailNotificationsDefault: true });
});

describe('groups.service', () => {
  describe('addStudent', () => {
    it("won't add a teacher's account to a group", async () => {
      p.user.findUnique.mockResolvedValue({ id: 't1', name: 'T', role: 'ADMIN' });
      await expect(addStudent('g1', 'T', 't@x.com')).rejects.toMatchObject({ status: 409 });
      expect(p.studentGroup.create).not.toHaveBeenCalled();
    });

    it('updateStudent rejects an empty name', async () => {
      p.studentGroup.findUnique.mockResolvedValue({ studentId: 's1', groupId: 'g1' });
      await expect(updateStudent('g1', 's1', { name: '   ' })).rejects.toMatchObject({ status: 400 });
      expect(p.user.update).not.toHaveBeenCalled();
    });

    it('throws 409 when the student is already in this group', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'existing', name: 'A', role: 'STUDENT' });
      p.studentGroup.findUnique.mockResolvedValue({ studentId: 'existing', groupId: 'g1' });
      await expect(addStudent('g1', 'A', 'a@x.com')).rejects.toMatchObject({ status: 409 });
      expect(p.user.create).not.toHaveBeenCalled();
    });

    it('joins an existing account (from another group) to this group instead of erroring, with a warning if the name differs', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'existing', name: 'Old Name', role: 'STUDENT' });
      p.studentGroup.findUnique.mockResolvedValue(null);
      p.studentGroup.create.mockResolvedValue({});
      const r = await addStudent('g1', 'New Name', 'a@x.com');
      expect(p.user.create).not.toHaveBeenCalled();
      expect(p.studentGroup.create).toHaveBeenCalledWith({ data: { studentId: 'existing', groupId: 'g1' } });
      expect(r.warning).toContain('Old Name');
    });

    it('creates a STUDENT with default password + githubUsername and links to group', async () => {
      p.user.findUnique.mockResolvedValue(null);
      p.user.create.mockResolvedValue({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: 'gh' });
      p.studentGroup.create.mockResolvedValue({});
      const r = await addStudent('g1', 'A', 'a@x.com', 'gh');
      expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          role: 'STUDENT', mustChangePassword: true, githubUsername: 'gh', password: 'hashed-pw',
        }),
      }));
      expect(p.studentGroup.create).toHaveBeenCalledWith({ data: { studentId: 's1', groupId: 'g1' } });
      expect(r).toEqual({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: 'gh' });
    });

    it('stores null githubUsername when not provided', async () => {
      p.user.findUnique.mockResolvedValue(null);
      p.user.create.mockResolvedValue({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: null });
      p.studentGroup.create.mockResolvedValue({});
      await addStudent('g1', 'A', 'a@x.com');
      expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ githubUsername: null }),
      }));
    });
  });

  describe('removeStudent', () => {
    it('deletes the composite studentGroup row', async () => {
      p.studentGroup.delete.mockResolvedValue({});
      await removeStudent('g1', 's1');
      expect(p.studentGroup.delete).toHaveBeenCalledWith({
        where: { studentId_groupId: { studentId: 's1', groupId: 'g1' } },
      });
    });
  });

  describe('resetStudentPassword', () => {
    beforeEach(() => p.studentGroup.findUnique.mockResolvedValue({ student: { role: 'STUDENT' } }));

    it('refuses an account outside the group or one that is not a student', async () => {
      p.studentGroup.findUnique.mockResolvedValue(null);
      await expect(resetStudentPassword('g1', 'other')).rejects.toMatchObject({ status: 404 });
      p.studentGroup.findUnique.mockResolvedValue({ student: { role: 'ADMIN' } });
      await expect(resetStudentPassword('g1', 't1')).rejects.toMatchObject({ status: 404 });
      expect(p.user.update).not.toHaveBeenCalled();
    });

    it('resets password, sets mustChangePassword and enqueues a reset-password email', async () => {
      p.user.update.mockResolvedValue({ email: 'a@x.com', name: 'A' });
      emailAdd.mockResolvedValue({});
      await resetStudentPassword('g1', 's1');
      expect(p.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { password: 'hashed-pw', mustChangePassword: true, tokenVersion: { increment: 1 } },
      });
      expect(emailAdd).toHaveBeenCalledWith('reset-password', { email: 'a@x.com', name: 'A' });
    });

    it('does not throw if enqueueing the email fails', async () => {
      p.user.update.mockResolvedValue({ email: 'a@x.com', name: 'A' });
      emailAdd.mockRejectedValue(new Error('redis down'));
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(resetStudentPassword('g1', 's1')).resolves.toBeUndefined();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });

  describe('createGroup / updateGroup', () => {
    it('createGroup returns the group with studentCount 0', async () => {
      p.group.create.mockResolvedValue({ id: 'g1', name: 'G', year: '2026' });
      const r = await createGroup({ name: 'G', seminar: 'סמינר מאיר', year: '2026' });
      expect(r).toMatchObject({ id: 'g1', studentCount: 0 });
    });

    it('createGroup trims the fields before saving', async () => {
      p.group.create.mockResolvedValue({ id: 'g1' });
      await createGroup({ name: ' יד ', seminar: ' סמינר מאיר ', year: ' תשפ"ז ' });
      expect(p.group.create).toHaveBeenCalledWith({ data: { name: 'יד', seminar: 'סמינר מאיר', year: 'תשפ"ז' } });
    });

    it('createGroup rejects a missing or blank seminar', async () => {
      await expect(createGroup({ name: 'G', year: '2026' } as never)).rejects.toMatchObject({ status: 400 });
      await expect(createGroup({ name: 'G', seminar: '   ', year: '2026' })).rejects.toMatchObject({ status: 400 });
      expect(p.group.create).not.toHaveBeenCalled();
    });

    it('updateGroup rejects clearing the seminar but leaves an unsent one alone', async () => {
      await expect(updateGroup('g1', { seminar: '' })).rejects.toMatchObject({ status: 400 });
      p.group.update.mockResolvedValue({ id: 'g1' });
      p.studentGroup.count.mockResolvedValue(0);
      await updateGroup('g1', { name: 'G2' });
      expect(p.group.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { name: 'G2', seminar: undefined, year: undefined } });
    });

    it('updateGroup returns the group with a recomputed studentCount', async () => {
      p.group.update.mockResolvedValue({ id: 'g1', name: 'G2' });
      p.studentGroup.count.mockResolvedValue(4);
      const r = await updateGroup('g1', { name: 'G2' });
      expect(r).toMatchObject({ id: 'g1', name: 'G2', studentCount: 4 });
    });
  });

  describe('getGroups', () => {
    it('maps _count.students into studentCount', async () => {
      p.group.findMany.mockResolvedValue([
        { id: 'g1', name: 'G', seminar: null, year: '2026', createdAt: new Date(), _count: { students: 5 } },
      ]);
      const r = await getGroups();
      expect(r[0]).toMatchObject({ id: 'g1', studentCount: 5 });
    });
  });

  describe('getGroupById', () => {
    it('returns null when not found', async () => {
      p.group.findUnique.mockResolvedValue(null);
      expect(await getGroupById('g1')).toBeNull();
    });
    it('flattens nested students and courses', async () => {
      p.group.findUnique.mockResolvedValue({
        id: 'g1', name: 'G', seminar: null, year: '2026', createdAt: new Date(),
        students: [{ student: { id: 's1', name: 'A', email: 'a@x.com', githubUsername: 'gh', createdAt: new Date() } }],
        courses: [{ id: 'c1', name: 'C', hidden: false, _count: { lessons: 3 } }],
      });
      const r = await getGroupById('g1');
      expect(r!.students).toEqual([expect.objectContaining({ id: 's1', githubUsername: 'gh' })]);
      expect(r!.courses).toEqual([{ id: 'c1', name: 'C', hidden: false, lessonCount: 3 }]);
    });
  });

  describe('deleteGroup', () => {
    it('throws 404 when the group is missing', async () => {
      p.group.findUnique.mockResolvedValue(null);
      await expect(deleteGroup('g1')).rejects.toMatchObject({ status: 404 });
      expect(p.group.delete).not.toHaveBeenCalled();
    });

    it('removes the courses and the group in one transaction, then releases their files', async () => {
      p.group.findUnique.mockResolvedValue({ id: 'g1', courses: [
        { id: 'c1', files: [{ url: 'u1' }], lessons: [{ files: [{ url: 'u2' }] }] },
        { id: 'c2', files: [], lessons: [] },
      ] });
      await deleteGroup('g1');
      expect(p.$transaction).toHaveBeenCalledTimes(1);
      expect(p.course.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g1' } });
      expect(p.group.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
      expect(releaseMock).toHaveBeenCalledWith(['u1', 'u2']);
    });

    it('releases nothing when the transaction fails', async () => {
      p.group.findUnique.mockResolvedValue({ id: 'g1', courses: [] });
      p.$transaction.mockRejectedValueOnce(new Error('db down'));
      await expect(deleteGroup('g1')).rejects.toThrow('db down');
      expect(releaseMock).not.toHaveBeenCalled();
    });
  });

  describe('importStudents', () => {
    it('collects synchronous validation errors for rows missing name/email', async () => {
      const buf = await xlsxBuffer([[null, 'a@x.com', null]]);
      const r = await importStudents('g1', buf);
      expect(r.errors.some((e) => e.includes('חסר שם או אימייל'))).toBe(true);
    });

    it("reports a row whose email belongs to a teacher instead of enrolling her", async () => {
      p.user.findUnique.mockResolvedValue({ id: 't1', role: 'ADMIN' });
      const r = await importStudents('g1', await xlsxBuffer([['T', 't@x.com', null]]));
      expect(r.imported).toBe(0);
      expect(r.errors[0]).toContain('שאינו תלמידה');
      expect(p.studentGroup.create).not.toHaveBeenCalled();
    });

    it('creates a new student and counts it as imported', async () => {
      p.user.findUnique.mockResolvedValue(null);
      p.user.create.mockResolvedValue({ id: 's1' });
      p.studentGroup.findUnique.mockResolvedValue(null);
      p.studentGroup.create.mockResolvedValue({});
      const buf = await xlsxBuffer([['A', 'a@x.com', 'gh']]);
      const r = await importStudents('g1', buf);
      expect(r.imported).toBe(1);
      expect(r.skipped).toBe(0);
      expect(p.studentGroup.create).toHaveBeenCalledTimes(1);
    });

    it('counts an already-enrolled student as skipped, not imported', async () => {
      p.user.findUnique.mockResolvedValue({ id: 's1', role: 'STUDENT' });
      p.studentGroup.findUnique.mockResolvedValue({ studentId: 's1', groupId: 'g1' });
      const buf = await xlsxBuffer([['A', 'a@x.com', 'gh']]);
      const r = await importStudents('g1', buf);
      expect(r.imported).toBe(0);
      expect(r.skipped).toBe(1);
      expect(p.studentGroup.create).not.toHaveBeenCalled();
    });
  });
});

describe('groups.service student accounts', () => {
  it('a new group member starts with the group\'s notification default and gets a verification email', async () => {
    p.group.findUnique.mockResolvedValue({ emailNotificationsDefault: false });
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: null });
    p.studentGroup.create.mockResolvedValue({});
    await addStudent('g1', 'A', 'a@x.com');
    expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ emailNotifications: false }),
    }));
    expect(sendVerificationMock).toHaveBeenCalledWith('s1');
  });

  it('createStudentAccount makes a student with no group', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: 's2', name: 'B', email: 'b@x.com', githubUsername: 'gh' });
    const s = await createStudentAccount({ name: ' B ', email: 'B@X.com', githubUsername: 'gh' });
    expect(s.id).toBe('s2');
    expect(p.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'B', email: 'b@x.com', role: 'STUDENT', emailNotifications: true }),
    }));
    expect(p.studentGroup.create).not.toHaveBeenCalled();
  });

  it('createStudentAccount refuses an address already in use', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'other' });
    await expect(createStudentAccount({ name: 'B', email: 'b@x.com' })).rejects.toMatchObject({ status: 409 });
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it('createStudentAccount requires a name', async () => {
    await expect(createStudentAccount({ name: '  ', email: 'b@x.com' })).rejects.toMatchObject({ status: 400 });
  });
});
