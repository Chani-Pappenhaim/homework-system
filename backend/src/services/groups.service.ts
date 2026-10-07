import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';
import { emailQueue } from '../infrastructure/queues/queues';
import { AppError } from '../utils/errors';
import { deleteCourse } from './courses.service';
import { sendEmailVerification, changeEmail } from './auth.service';
import { cellText, isValidEmail, normalizeGithubUsername, buildTemplateWorkbook } from '../utils/excel';

export async function getGroups() {
  const groups = await prisma.group.findMany({
    include: { _count: { select: { students: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return groups.map((g) => ({
    id: g.id, name: g.name, seminar: g.seminar, year: g.year,
    emailNotificationsDefault: g.emailNotificationsDefault,
    createdAt: g.createdAt, studentCount: g._count.students,
  }));
}

type GroupFields = { name: string; seminar: string; year: string };
type GroupSettings = { emailNotificationsDefault?: boolean };

function groupSettings(data: GroupSettings): GroupSettings {
  return data.emailNotificationsDefault === undefined ? {} : { emailNotificationsDefault: Boolean(data.emailNotificationsDefault) };
}

const GROUP_FIELD_LABELS: Record<keyof GroupFields, string> = {
  seminar: 'שם הסמינר',
  name: 'שם הקבוצה',
  year: 'שנת הלימודים',
};

/**
 * Trims every field that was sent and rejects one left blank. The seminar is
 * part of how a group is named ("סמינר מאיר יד תשפ״ז"), so it is as required as
 * the name and year; on update a field that was not sent stays as it is.
 */
function cleanGroupFields<T extends Partial<GroupFields>>(data: T): T {
  const cleaned = { ...data };
  for (const key of Object.keys(GROUP_FIELD_LABELS) as (keyof GroupFields)[]) {
    if (data[key] === undefined) continue;
    const value = String(data[key] ?? '').trim();
    if (!value) throw new AppError(`Group ${key} is required`, `${GROUP_FIELD_LABELS[key]} הוא שדה חובה`, 400);
    cleaned[key] = value as T[typeof key];
  }
  return cleaned;
}

export async function createGroup(data: GroupFields & GroupSettings) {
  for (const key of Object.keys(GROUP_FIELD_LABELS) as (keyof GroupFields)[]) {
    if (data[key] === undefined) {
      throw new AppError(`Group ${key} is required`, `${GROUP_FIELD_LABELS[key]} הוא שדה חובה`, 400);
    }
  }
  const { name, seminar, year } = cleanGroupFields(data);
  const group = await prisma.group.create({ data: { name, seminar, year, ...groupSettings(data) } });
  return { ...group, studentCount: 0 };
}

export async function getGroupById(id: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      students: { include: { student: { select: { id: true, name: true, email: true, githubUsername: true, createdAt: true, emailVerifiedAt: true, emailNotifications: true } } } },
      courses: { select: { id: true, name: true, hidden: true, _count: { select: { lessons: true } } } },
    },
  });
  if (!group) return null;
  return {
    id: group.id, name: group.name, seminar: group.seminar,
    year: group.year, createdAt: group.createdAt,
    emailNotificationsDefault: group.emailNotificationsDefault,
    students: group.students.map(({ student: { emailVerifiedAt, ...s } }) => ({ ...s, emailVerified: Boolean(emailVerifiedAt) })),
    courses: group.courses.map((c) => ({ id: c.id, name: c.name, hidden: c.hidden, lessonCount: c._count.lessons })),
  };
}

export async function updateGroup(id: string, data: Partial<GroupFields> & GroupSettings) {
  const { name, seminar, year } = cleanGroupFields(data);
  const group = await prisma.group.update({ where: { id }, data: { name, seminar, year, ...groupSettings(data) } });
  const count = await prisma.studentGroup.count({ where: { groupId: id } });
  return { ...group, studentCount: count };
}

/**
 * Adding a student whose email already exists in a different group is a
 * valid cross-group enrollment, not a collision — the only real collision is
 * the same email already being in *this* group. An existing account's
 * name/GitHub username are never overwritten; a `warning` is returned instead
 * when the submitted name differs from the stored one.
 */
export async function addStudent(groupId: string, name: string, email: string, githubUsername?: string) {
  email = email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new AppError('Invalid email address', 'כתובת אימייל לא תקינה', 400);
  githubUsername = githubUsername ? normalizeGithubUsername(githubUsername) : undefined;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    const alreadyInGroup = await prisma.studentGroup.findUnique({
      where: { studentId_groupId: { studentId: existing.id, groupId } },
    });
    if (alreadyInGroup) throw new AppError('Student with this email already in group', 'תלמידה עם המייל הזה כבר נמצאת בקבוצה זו', 409);

    await prisma.studentGroup.create({ data: { studentId: existing.id, groupId } });
    const warning = existing.name !== name
      ? `קיימת כבר תלמידה עם המייל הזה בשם "${existing.name}" — היא נוספה לקבוצה, השם החדש לא נשמר`
      : undefined;
    return { id: existing.id, name: existing.name, email: existing.email, githubUsername: existing.githubUsername, warning };
  }

  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { emailNotificationsDefault: true } });
  if (!group) throw new AppError('Group not found', 'הקבוצה לא נמצאה', 404);
  const student = await createStudentAccount({ name, email, githubUsername, emailNotifications: group.emailNotificationsDefault });
  await prisma.studentGroup.create({ data: { studentId: student.id, groupId } });
  return { id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername };
}

/**
 * A new student account with the default password, and a verification email
 * on its way so notifications can reach her once she confirms the address.
 */
export async function createStudentAccount(data: {
  name: string; email: string; githubUsername?: string | null; emailNotifications?: boolean;
}) {
  const name = data.name?.trim();
  if (!name) throw new AppError('Name is required', 'יש להזין שם', 400);
  const email = data.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new AppError('Invalid email address', 'כתובת אימייל לא תקינה', 400);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new AppError('Email already in use', 'כתובת המייל הזו כבר בשימוש', 409);
  }
  const hashed = await bcrypt.hash('12345678', 12);
  const student = await prisma.user.create({
    data: {
      name, email, password: hashed, role: 'STUDENT', mustChangePassword: true,
      githubUsername: data.githubUsername ? normalizeGithubUsername(data.githubUsername) || null : null,
      emailNotifications: data.emailNotifications ?? true,
    },
  });
  await sendEmailVerification(student.id);
  return student;
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
  if (!inGroup) throw new AppError('Student not found in this group', 'התלמידה לא נמצאה בקבוצה זו', 404);

  const update: { name?: string; githubUsername?: string | null } = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.githubUsername !== undefined) update.githubUsername = normalizeGithubUsername(data.githubUsername) || null;
  const emailChanged = data.email !== undefined && (await changeEmail(studentId, data.email));

  const student = await prisma.user.update({ where: { id: studentId }, data: update });
  if (emailChanged) await sendEmailVerification(studentId);
  return { id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername };
}

// Deletes a group. Student memberships cascade automatically, but the
// Course->Group relation is Restrict, so the group's courses must be removed
// first. Student user accounts are left intact since they may belong to
// other groups.
export async function deleteGroup(id: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    include: { courses: { select: { id: true } } },
  });
  if (!group) throw new AppError('Group not found', 'הקבוצה לא נמצאה', 404);

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
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { emailNotificationsDefault: true } });
  if (!group) throw new AppError('Group not found', 'הקבוצה לא נמצאה', 404);

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
          data: {
            name, email, password: hashed, role: 'STUDENT', mustChangePassword: true, githubUsername,
            emailNotifications: group.emailNotificationsDefault,
          },
        });
        await sendEmailVerification(user.id);
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
