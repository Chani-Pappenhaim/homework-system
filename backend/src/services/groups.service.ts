import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';
import { emailQueue } from '../infrastructure/queues/queues';
import { AppError } from '../utils/errors';
import { releaseFileUrls, submissionFileUrls } from '../utils/file-refs';
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
// Teachers have accounts too; adding one to a group by her email would make
// her a "student" of it, so only student accounts may join.
function notAStudent() {
  return new AppError('Email belongs to a non-student account', 'כתובת המייל שייכת לחשבון שאינו תלמידה', 409);
}

export async function addStudent(groupId: string, name: string, email: string, githubUsername?: string) {
  email = email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new AppError('Invalid email address', 'כתובת אימייל לא תקינה', 400);
  githubUsername = githubUsername ? normalizeGithubUsername(githubUsername) : undefined;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== 'STUDENT') throw notAStudent();
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
  if (data.name !== undefined) {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) throw new AppError('Name is required', 'יש להזין שם', 400);
    update.name = name;
  }
  if (data.githubUsername !== undefined) update.githubUsername = normalizeGithubUsername(data.githubUsername) || null;
  const emailChanged = data.email !== undefined && (await changeEmail(studentId, data.email));

  const student = await prisma.user.update({ where: { id: studentId }, data: update });
  if (emailChanged) await sendEmailVerification(studentId);
  return { id: student.id, name: student.name, email: student.email, githubUsername: student.githubUsername };
}

// Deletes a group with its courses in one transaction — a failure halfway
// can't leave a group stripped of some courses. Student memberships and
// everything under the courses cascade in the DB; student accounts stay, since
// they may belong to other groups. Stored files nothing else uses are released
// afterwards, best-effort.
export async function deleteGroup(id: string) {
  const group = await prisma.group.findUnique({
    where: { id },
    include: { courses: { include: { files: true, lessons: { include: { files: true } } } } },
  });
  if (!group) throw new AppError('Group not found', 'הקבוצה לא נמצאה', 404);

  const urls = group.courses.flatMap((c) => [
    ...c.files.map((f) => f.url),
    ...c.lessons.flatMap((l) => l.files.map((f) => f.url)),
  ]);
  urls.push(...await submissionFileUrls({ assignment: { lesson: { course: { groupId: id } } } }));

  await prisma.$transaction([
    prisma.course.deleteMany({ where: { groupId: id } }),
    prisma.group.delete({ where: { id } }),
  ]);
  await releaseFileUrls(urls);
}

/** Column order of the student import sheet; the first row is headers and is not read. */
const STUDENT_IMPORT_COLUMNS = [
  { header: 'שם מלא (חובה)', example: 'ישראלה ישראלי' },
  { header: 'אימייל (חובה)', example: 'student@example.com' },
  { header: 'שם משתמש GitHub (רשות)', example: 'israela-gh' },
];

export type StudentImportResult = {
  dryRun: boolean;
  /** Data rows read from the sheet (blank rows aside). */
  totalRows: number;
  /** Rows that add a student to the group — added already, or to be added when dryRun. */
  toAdd: number;
  /** Rows whose student is already in the group. */
  alreadyInGroup: number;
  /** One line per row that is not imported, in Hebrew, starting with its row number. */
  errors: string[];
};

/**
 * Reads the sheet and checks every row. With dryRun nothing is written, so the
 * teacher sees each problem and decides whether to add only the valid rows or
 * fix the file first; without it, the valid rows are added and the rest are
 * reported again.
 */
export async function importStudents(groupId: string, buffer: Buffer, { dryRun = false } = {}): Promise<StudentImportResult> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { emailNotificationsDefault: true } });
  if (!group) throw new AppError('Group not found', 'הקבוצה לא נמצאה', 404);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new AppError('Not a readable xlsx file', 'לא ניתן לקרוא את הקובץ. יש להעלות קובץ Excel בפורמט xlsx', 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('Workbook has no sheets', 'בקובץ אין גיליון', 400);

  const errors: { rowNumber: number; message: string }[] = [];
  const rows: Array<{ rowNumber: number; name: string; email: string; githubUsername: string | null }> = [];
  const firstRowByEmail = new Map<string, number>();
  let totalRows = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // headers
    const name = cellText(row.getCell(1)).trim();
    const email = cellText(row.getCell(2)).trim().toLowerCase();
    const github = cellText(row.getCell(3)).trim();
    if (!name && !email && !github) return; // a row left blank
    totalRows++;

    const problems: string[] = [];
    if (!name) problems.push('חסר שם');
    if (!email) problems.push('חסרה כתובת אימייל');
    else if (!isValidEmail(email)) problems.push(`כתובת האימייל "${email}" אינה תקינה`);
    else if (firstRowByEmail.has(email)) problems.push(`האימייל ${email} כבר מופיע בשורה ${firstRowByEmail.get(email)}`);
    if (problems.length) { errors.push({ rowNumber, message: problems.join(', ') }); return; }

    firstRowByEmail.set(email, rowNumber);
    rows.push({ rowNumber, name, email, githubUsername: normalizeGithubUsername(github) || null });
  });

  if (totalRows === 0) {
    throw new AppError(
      'No student rows in the file',
      'לא נמצאו תלמידות בקובץ. השורה הראשונה היא שורת כותרות, והתלמידות מתחילות מהשורה השנייה',
      400
    );
  }

  let toAdd = 0;
  let alreadyInGroup = 0;
  const hashed = dryRun ? '' : await bcrypt.hash('12345678', 12);

  for (const { rowNumber, name, email, githubUsername } of rows) {
    try {
      let user = await prisma.user.findUnique({ where: { email } });
      if (user && user.role !== 'STUDENT') {
        errors.push({ rowNumber, message: `${email} שייך לחשבון של מורה ולא של תלמידה` });
        continue;
      }
      const inGroup = user && await prisma.studentGroup.findUnique({
        where: { studentId_groupId: { studentId: user.id, groupId } },
      });
      if (inGroup) { alreadyInGroup++; continue; }
      if (dryRun) { toAdd++; continue; }

      if (!user) {
        user = await prisma.user.create({
          data: {
            name, email, password: hashed, role: 'STUDENT', mustChangePassword: true, githubUsername,
            emailNotifications: group.emailNotificationsDefault,
          },
        });
        await sendEmailVerification(user.id);
      }
      await prisma.studentGroup.create({ data: { studentId: user.id, groupId } });
      toAdd++;
    } catch (err) {
      console.error(`[groups] import row ${rowNumber} failed:`, err);
      errors.push({ rowNumber, message: `שגיאה בהוספת ${email}` });
    }
  }

  errors.sort((a, b) => a.rowNumber - b.rowNumber);
  return { dryRun, totalRows, toAdd, alreadyInGroup, errors: errors.map((e) => `שורה ${e.rowNumber}: ${e.message}`) };
}

export function buildStudentImportTemplate() {
  return buildTemplateWorkbook(
    STUDENT_IMPORT_COLUMNS.map((c) => c.header),
    STUDENT_IMPORT_COLUMNS.map((c) => c.example),
    [
      'הוראות מילוי',
      'כל שורה היא תלמידה אחת. השורה הראשונה היא שורת כותרות ולא נקראת.',
      'סדר העמודות קובע, לא שם הכותרת:',
      'עמודה A — שם מלא — חובה',
      'עמודה B — אימייל — חובה. כל אימייל פעם אחת בקובץ',
      'עמודה C — שם משתמש GitHub או קישור לפרופיל — רשות, אפשר להשאיר ריק',
      'תלמידה שכבר יש לה חשבון מצורפת לקבוצה עם החשבון הקיים. תלמידה חדשה מקבלת סיסמה זמנית 12345678.',
      'לפני ההוספה תוצג בדיקה של הקובץ עם כל השגיאות, ואפשר לבחור להוסיף רק את השורות התקינות.',
    ],
  );
}

// Scoped to the group in the URL: a teacher resets a student of that group,
// never another teacher's password by passing her id.
export async function resetStudentPassword(groupId: string, studentId: string) {
  const membership = await prisma.studentGroup.findUnique({
    where: { studentId_groupId: { studentId, groupId } },
    select: { student: { select: { role: true } } },
  });
  if (!membership || membership.student.role !== 'STUDENT') {
    throw new AppError('Student not found in this group', 'התלמידה לא נמצאה בקבוצה זו', 404);
  }
  const hashed = await bcrypt.hash('12345678', 12);
  const user = await prisma.user.update({
    where: { id: studentId },
    data: { password: hashed, mustChangePassword: true, tokenVersion: { increment: 1 } },
  });
  try {
    await emailQueue.add('reset-password', { email: user.email, name: user.name });
  } catch (err) {
    console.error('[groups] Failed to enqueue reset-password email:', err);
  }
}
