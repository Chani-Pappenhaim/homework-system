import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    studentGroup: { create: vi.fn(), delete: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    group: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed-pw'), compare: vi.fn() },
}));

const { emailAdd } = vi.hoisted(() => ({ emailAdd: vi.fn() }));
vi.mock('../../src/infrastructure/queues/queues', () => ({
  emailQueue: { add: emailAdd },
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import {
  addStudent,
  removeStudent,
  resetStudentPassword,
  createGroup,
  updateGroup,
  getGroups,
  getGroupById,
  importStudents,
} from '../../src/services/groups.service';

const p = prisma as any;

async function xlsxBuffer(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('S');
  sheet.addRow(['Name', 'Email', 'GitHub']);
  rows.forEach((r) => sheet.addRow(r));
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

beforeEach(() => vi.clearAllMocks());

describe('groups.service', () => {
  describe('addStudent', () => {
    it('throws 409 when the email already exists', async () => {
      p.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(addStudent('g1', 'A', 'a@x.com')).rejects.toMatchObject({ status: 409 });
      expect(p.user.create).not.toHaveBeenCalled();
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
    it('resets password, sets mustChangePassword and enqueues a reset-password email', async () => {
      p.user.update.mockResolvedValue({ email: 'a@x.com', name: 'A' });
      emailAdd.mockResolvedValue({});
      await resetStudentPassword('s1');
      expect(p.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { password: 'hashed-pw', mustChangePassword: true },
      });
      expect(emailAdd).toHaveBeenCalledWith('reset-password', { email: 'a@x.com', name: 'A' });
    });

    it('does not throw if enqueueing the email fails', async () => {
      p.user.update.mockResolvedValue({ email: 'a@x.com', name: 'A' });
      emailAdd.mockRejectedValue(new Error('redis down'));
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(resetStudentPassword('s1')).resolves.toBeUndefined();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });

  describe('createGroup / updateGroup', () => {
    it('createGroup returns the group with studentCount 0', async () => {
      p.group.create.mockResolvedValue({ id: 'g1', name: 'G', year: '2026' });
      const r = await createGroup({ name: 'G', year: '2026' });
      expect(r).toMatchObject({ id: 'g1', studentCount: 0 });
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
        courses: [{ id: 'c1', name: 'C' }],
      });
      const r = await getGroupById('g1');
      expect(r!.students).toEqual([expect.objectContaining({ id: 's1', githubUsername: 'gh' })]);
      expect(r!.courses).toEqual([{ id: 'c1', name: 'C' }]);
    });
  });

  describe('importStudents', () => {
    it('collects synchronous validation errors for rows missing name/email', async () => {
      const buf = await xlsxBuffer([[null, 'a@x.com', null]]);
      const r = await importStudents('g1', buf);
      expect(r.errors.some((e) => e.includes('missing name or email'))).toBe(true);
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
      p.user.findUnique.mockResolvedValue({ id: 's1' });
      p.studentGroup.findUnique.mockResolvedValue({ studentId: 's1', groupId: 'g1' });
      const buf = await xlsxBuffer([['A', 'a@x.com', 'gh']]);
      const r = await importStudents('g1', buf);
      expect(r.imported).toBe(0);
      expect(r.skipped).toBe(1);
      expect(p.studentGroup.create).not.toHaveBeenCalled();
    });
  });
});
