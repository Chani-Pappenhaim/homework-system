import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';
import { emailQueue } from '../infrastructure/queues/queues';
import { deleteCourse } from './courses.service';

export async function getGroups() {
  const groups = await prisma.group.findMany({
    include: { _count: { select: { students: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return groups.map((g) => ({
    id: g.id, name: g.name, seminar: g.seminar, year: g.year,
    createdAt: g.createdAt, studentCount: g._count.students,
  }));
}

export async function createGroup(data: { name: string; seminar?: string; year: string }) {
  const group = await prisma.group.create({ data });
  return { ...group, studentCount: 0 };
}

export async function getGroupById(id: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      students: { include: { student: { select: { id: true, name: true, email: true, githubUsername: true, createdAt: true } } } },
      courses: { select: { id: true, name: true } },
    },
  });
  if (!group) return null;
  return {
    id: group.id, name: group.name, seminar: group.seminar,
    year: group.year, createdAt: group.createdAt,
    students: group.students.map((sg) => sg.student),
    courses: group.courses,
  };
}

export async function updateGroup(id: string, data: { name?: string; seminar?: string; year?: string }) {
  const group = await prisma.group.update({ where: { id }, data });
  const count = await prisma.studentGroup.count({ where: { groupId: id } });
  return { ...group, studentCount: count };
}

export async function addStudent(groupId: string, name: string, email: string, githubUsername?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error('Email already exists'), { status: 409 });

  const hashed = await bcrypt.hash('12345678', 12);
  const student = await prisma.user.create({
    data: { name, email, password: hashed, role: 'STUDENT', mustChangePassword: true, githubUsername: githubUsername || null },
  });
  await prisma.studentGroup.create({ data: { studentId: student.id, groupId } });
  return { id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername };
}

export async function removeStudent(groupId: string, studentId: string) {
  await prisma.studentGroup.delete({ where: { studentId_groupId: { studentId, groupId } } });
}

// Deletes a group. Student memberships (StudentGroup) cascade automatically, but
// the Course->Group relation is Restrict, so we must remove the group's courses
// first (which cascades their lessons/assignments/submissions and cleans up
// stored files). Student user accounts are left intact — they may belong to
// other groups.
export async function deleteGroup(id: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    include: { courses: { select: { id: true } } },
  });
  if (!group) throw Object.assign(new Error('Group not found'), { status: 404 });

  for (const course of group.courses) {
    await deleteCourse(course.id);
  }

  await prisma.group.delete({ where: { id } });
}

export async function importStudents(groupId: string, buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const hashed = await bcrypt.hash('12345678', 12);

  const rows: Array<{ rowNumber: number; name: string; email: string; githubUsername: string | null }> = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const name = String(row.getCell(1).value ?? '').trim();
    const email = String(row.getCell(2).value ?? '').trim();
    const githubUsername = String(row.getCell(3).value ?? '').trim() || null;
    if (!name || !email) { errors.push(`Row ${rowNumber}: missing name or email`); return; }
    rows.push({ rowNumber, name, email, githubUsername });
  });

  for (const { rowNumber, name, email, githubUsername } of rows) {
    try {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { name, email, password: hashed, role: 'STUDENT', mustChangePassword: true, githubUsername },
        });
      }
      const exists = await prisma.studentGroup.findUnique({
        where: { studentId_groupId: { studentId: user.id, groupId } },
      });
      if (!exists) {
        await prisma.studentGroup.create({ data: { studentId: user.id, groupId } });
        imported++;
      } else {
        skipped++;
      }
    } catch {
      errors.push(`Row ${rowNumber}: failed to process ${email}`);
    }
  }

  return { imported, skipped, errors };
}

export async function resetStudentPassword(studentId: string) {
  const hashed = await bcrypt.hash('12345678', 12);
  const user = await prisma.user.update({
    where: { id: studentId },
    data: { password: hashed, mustChangePassword: true },
  });
  try {
    await emailQueue.add('reset-password', { email: user.email, name: user.name });
  } catch (err) {
    console.error('[groups] Failed to enqueue reset-password email:', err);
  }
}
