import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    course: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    studentGroup: { create: vi.fn(), delete: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    group: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

const { releaseMock, submissionUrlsMock } = vi.hoisted(() => ({ releaseMock: vi.fn(), submissionUrlsMock: vi.fn() }));
vi.mock('../../src/services/file-refs.service', () => ({ releaseFileUrls: releaseMock, submissionFileUrls: submissionUrlsMock }));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed-pw'), compare: vi.fn() },
}));

// The verification email is email-verification.service's concern, covered by its own tests.
const { sendVerificationMock } = vi.hoisted(() => ({ sendVerificationMock: vi.fn() }));
vi.mock('../../src/services/email-verification.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/email-verification.service')>()),
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
  exportGroupStudents,
  deleteGroup,
  createStudentAccount,
  updateStudentAccount,
  deleteStudentAccount,
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
  p.user.findFirst.mockResolvedValue({ id: 's1' });
  submissionUrlsMock.mockResolvedValue([]);
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
    it('maps _count into studentCount and courseCount', async () => {
      p.group.findMany.mockResolvedValue([
        { id: 'g1', name: 'G', seminar: null, year: '2026', createdAt: new Date(), _count: { students: 5, courses: 2 } },
      ]);
      const r = await getGroups();
      expect(r[0]).toMatchObject({ id: 'g1', studentCount: 5, courseCount: 2 });
      // The list can warn how many courses a deletion takes with it.
      expect(p.group.findMany).toHaveBeenCalledWith(expect.objectContaining({
        include: { _count: { select: { students: true, courses: true } } },
      }));
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

  describe('exportGroupStudents', () => {
    it("lists the group's students in the import's own columns, so the file imports back as is", async () => {
      p.group.findUnique.mockResolvedValue({
        name: 'יד', seminar: 'סמינר מאיר', year: 'תשפ״ז',
        students: [
          { student: { name: 'רחל לוי', email: 'rachel@x.com', githubUsername: null } },
          { student: { name: 'דינה כהן', email: 'dina@x.com', githubUsername: 'dina-gh' } },
        ],
      });
      const { buffer, groupName } = await exportGroupStudents('g1');
      expect(groupName).toBe('סמינר מאיר יד תשפ״ז');

      p.user.findUnique.mockResolvedValue(null);
      p.studentGroup.findUnique.mockResolvedValue(null);
      const back = await importStudents('g2', buffer, { dryRun: true });
      expect(back).toMatchObject({ totalRows: 2, toAdd: 2, errors: [] });
    });

    it('refuses a group that does not exist', async () => {
      p.group.findUnique.mockResolvedValue(null);
      await expect(exportGroupStudents('nope')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('importStudents', () => {
    it('names what is missing in each row', async () => {
      p.user.findUnique.mockResolvedValue(null);
      const buf = await xlsxBuffer([[null, 'a@x.com', null], ['B', null, 'gh'], ['C', 'not-an-email', null]]);
      const r = await importStudents('g1', buf, { dryRun: true });
      expect(r.errors).toEqual([
        'שורה 2: חסר שם',
        'שורה 3: חסרה כתובת אימייל',
        'שורה 4: כתובת האימייל "not-an-email" אינה תקינה',
      ]);
      expect(r.totalRows).toBe(3);
      expect(r.toAdd).toBe(0);
    });

    it('reports an email that appears twice in the file and keeps the first', async () => {
      p.user.findUnique.mockResolvedValue(null);
      const r = await importStudents('g1', await xlsxBuffer([['A', 'a@x.com', null], ['A2', 'A@x.com', null]]), { dryRun: true });
      expect(r.toAdd).toBe(1);
      expect(r.errors).toEqual(['שורה 3: האימייל a@x.com כבר מופיע בשורה 2']);
    });

    it('ignores blank rows and refuses a file with no student rows', async () => {
      await expect(importStudents('g1', await xlsxBuffer([[null, null, null]]))).rejects.toMatchObject({ status: 400 });
    });

    it('a dry run counts the rows to add without writing anything', async () => {
      p.user.findUnique.mockResolvedValue(null);
      const r = await importStudents('g1', await xlsxBuffer([['A', 'a@x.com', null], ['B', null, null]]), { dryRun: true });
      expect(r).toMatchObject({ dryRun: true, totalRows: 2, toAdd: 1, alreadyInGroup: 0 });
      expect(r.errors).toHaveLength(1);
      expect(p.user.create).not.toHaveBeenCalled();
      expect(p.studentGroup.create).not.toHaveBeenCalled();
      expect(sendVerificationMock).not.toHaveBeenCalled();
    });

    it('the real import adds the valid rows and reports the rest', async () => {
      p.user.findUnique.mockResolvedValue(null);
      p.user.create.mockResolvedValue({ id: 's1' });
      p.studentGroup.create.mockResolvedValue({});
      const r = await importStudents('g1', await xlsxBuffer([['A', 'a@x.com', null], ['B', null, null]]));
      expect(r).toMatchObject({ dryRun: false, toAdd: 1 });
      expect(r.errors).toEqual(['שורה 3: חסרה כתובת אימייל']);
      expect(p.studentGroup.create).toHaveBeenCalledTimes(1);
    });

    it("reports a row whose email belongs to a teacher instead of enrolling her", async () => {
      p.user.findUnique.mockResolvedValue({ id: 't1', role: 'ADMIN' });
      const r = await importStudents('g1', await xlsxBuffer([['T', 't@x.com', null]]));
      expect(r.toAdd).toBe(0);
      expect(r.errors[0]).toContain('חשבון של מורה');
      expect(p.studentGroup.create).not.toHaveBeenCalled();
    });

    it('creates a new student and counts it as imported', async () => {
      p.user.findUnique.mockResolvedValue(null);
      p.user.create.mockResolvedValue({ id: 's1' });
      p.studentGroup.findUnique.mockResolvedValue(null);
      p.studentGroup.create.mockResolvedValue({});
      const buf = await xlsxBuffer([['A', 'a@x.com', 'gh']]);
      const r = await importStudents('g1', buf);
      expect(r.toAdd).toBe(1);
      expect(r.alreadyInGroup).toBe(0);
      expect(p.studentGroup.create).toHaveBeenCalledTimes(1);
    });

    it('counts an already-enrolled student as skipped, not imported', async () => {
      p.user.findUnique.mockResolvedValue({ id: 's1', role: 'STUDENT' });
      p.studentGroup.findUnique.mockResolvedValue({ studentId: 's1', groupId: 'g1' });
      const buf = await xlsxBuffer([['A', 'a@x.com', 'gh']]);
      const r = await importStudents('g1', buf);
      expect(r.toAdd).toBe(0);
      expect(r.alreadyInGroup).toBe(1);
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

describe('groups.service editing / deleting a student account', () => {
  it('updateStudentAccount edits a student who is in no group', async () => {
    p.user.update.mockResolvedValue({ id: 's1', name: 'New', email: 'a@x.com', githubUsername: 'gh' });
    const r = await updateStudentAccount('s1', { name: ' New ', githubUsername: 'https://github.com/gh' });
    expect(p.studentGroup.findUnique).not.toHaveBeenCalled();
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { name: 'New', githubUsername: 'gh' } });
    expect(r).toEqual({ id: 's1', name: 'New', email: 'a@x.com', githubUsername: 'gh' });
  });

  it('an empty GitHub username clears it', async () => {
    p.user.update.mockResolvedValue({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: null });
    await updateStudentAccount('s1', { githubUsername: '' });
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { githubUsername: null } });
  });

  it('a non-string GitHub username clears it instead of crashing', async () => {
    p.user.update.mockResolvedValue({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: null });
    await updateStudentAccount('s1', { githubUsername: 42 });
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { githubUsername: null } });
  });

  it('updateStudent through a group clears GitHub too', async () => {
    p.studentGroup.findUnique.mockResolvedValue({ studentId: 's1', groupId: 'g1' });
    p.user.update.mockResolvedValue({ id: 's1', name: 'A', email: 'a@x.com', githubUsername: null });
    await updateStudent('g1', 's1', { githubUsername: '' });
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { githubUsername: null } });
  });

  it('updateStudentAccount refuses a non-student (a teacher account) with 404', async () => {
    p.user.findFirst.mockResolvedValue(null);
    await expect(updateStudentAccount('t1', { name: 'X' })).rejects.toMatchObject({ status: 404 });
    expect(p.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1', role: 'STUDENT' } }));
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it('a changed email is re-verified', async () => {
    p.user.findUnique.mockResolvedValueOnce({ email: 'old@x.com' }).mockResolvedValueOnce(null);
    p.user.update.mockResolvedValue({ id: 's1', name: 'A', email: 'new@x.com', githubUsername: null });
    await updateStudentAccount('s1', { email: 'New@X.com' });
    expect(sendVerificationMock).toHaveBeenCalledWith('s1');
  });

  it('deleteStudentAccount deletes the user and releases her submission files afterwards', async () => {
    submissionUrlsMock.mockResolvedValue(['u1', 'u2']);
    const order: string[] = [];
    p.user.delete.mockImplementation(async () => { order.push('delete'); });
    releaseMock.mockImplementation(async () => { order.push('release'); });
    await deleteStudentAccount('s1');
    expect(submissionUrlsMock).toHaveBeenCalledWith({ studentId: 's1' });
    expect(p.user.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(releaseMock).toHaveBeenCalledWith(['u1', 'u2']);
    expect(order).toEqual(['delete', 'release']);
  });

  it('deleteStudentAccount refuses a teacher or a missing account with 404', async () => {
    p.user.findFirst.mockResolvedValue(null);
    await expect(deleteStudentAccount('t1')).rejects.toMatchObject({ status: 404 });
    expect(p.user.delete).not.toHaveBeenCalled();
  });
});
