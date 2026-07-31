import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';
import { emailQueue } from '../infrastructure/queues/queues';
import { deleteCourse } from './courses.service';
import { cellText, isValidEmail, normalizeGithubUsername, buildTemplateWorkbook } from '../utils/excel';

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

/**
 * Adding a student whose email already exists elsewhere (a different group)
 * is a legitimate cross-group enrollment, not a collision — this used to
 * throw "Email already exists" for that case too, which silently blocked a
 * teacher from re-using the same student account in a second group.
 * The one real collision is the same email already in *this* group.
 * The existing account's name/GitHub username are never overwritten — a
 * `warning` is returned instead so the caller can tell the teacher that the
 * name they typed didn't change an existing record with a different name.
 */
export async function addStudent(groupId: string, name: string, email: string, githubUsername?: string) {
  email = email.trim().toLowerCase();
  if (!isValidEmail(email)) throw Object.assign(new Error('כתובת אימייל לא תקינה'), { status: 400 });
  githubUsername = githubUsername ? normalizeGithubUsername(githubUsername) : undefined;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const alreadyInGroup = await prisma.studentGroup.findUnique({
      where: { studentId_groupId: { studentId: existing.id, groupId } },
    });
    if (alreadyInGroup) throw Object.assign(new Error('תלמידה עם המייל הזה כבר נמצאת בקבוצה זו'), { status: 409 });

    await prisma.studentGroup.create({ data: { studentId: existing.id, groupId } });
    const warning = existing.name !== name
      ? `קיימת כבר תלמידה עם המייל הזה בשם "${existing.name}" — היא נוספה לקבוצה, השם החדש לא נשמר`
      : undefined;
    return { id: existing.id, name: existing.name, email: existing.email, githubUsername: existing.githubUsername, warning };
  }

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

export async function removeStudents(groupId: string, studentIds: string[]) {
  const result = await prisma.studentGroup.deleteMany({ where: { groupId, studentId: { in: studentIds } } });
  return { removed: result.count };
}

export async function updateStudent(
  groupId: string,
  studentId: string,
  data: { name?: string; email?: string; githubUsername?: string }
) {
  const inGroup = await prisma.studentGroup.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
  if (!inGroup) throw Object.assign(new Error('Student not found in this group'), { status: 404 });

  const update: { name?: string; email?: string; githubUsername?: string | null } = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.githubUsername !== undefined) update.githubUsername = normalizeGithubUsername(data.githubUsername) || null;
  if (data.email !== undefined) {
    const email = data.email.trim().toLowerCase();
    if (!isValidEmail(email)) throw Object.assign(new Error('כתובת אימייל לא תקינה'), { status: 400 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== studentId) throw Object.assign(new Error('כתובת המייל הזו כבר בשימוש'), { status: 409 });
    update.email = email;
  }

  const student = await prisma.user.update({ where: { id: studentId }, data: update });
  return { id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername };
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
    const name = cellText(row.getCell(1)).trim();
    const email = cellText(row.getCell(2)).trim().toLowerCase();
    const githubUsername = normalizeGithubUsername(cellText(row.getCell(3))) || null;
    if (!name || !email) { errors.push(`שורה ${rowNumber}: חסר שם או אימייל`); return; }
    if (!isValidEmail(email)) { errors.push(`שורה ${rowNumber}: כתובת אימייל לא תקינה (${email})`); return; }
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
      errors.push(`שורה ${rowNumber}: שגיאה בעיבוד ${email}`);
    }
  }

  return { imported, skipped, errors };
}

export function buildStudentImportTemplate() {
  return buildTemplateWorkbook(['name', 'email', 'githubUsername'], ['ישראלה ישראלי', 'student@example.com', 'israela-gh']);
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
