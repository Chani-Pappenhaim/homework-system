import ExcelJS from 'exceljs';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { buildTemplateWorkbook, cellText } from '../utils/excel';
import { getRepoStatus, parseRepoRef } from '../utils/github';
import { loadRoster } from './roster.service';

/** The blank sheet importSubmissions reads: assignment title, student email, repo. */
export function buildSubmissionsTemplate(): Promise<Buffer> {
  return buildTemplateWorkbook(['שם המטלה', 'מייל התלמידה', 'ריפו (שם, owner/repo או קישור)'], ['תרגיל 1', 'student@example.com', 'my-repo']);
}

/**
 * Records a student's repo as her submission of the assignment, as the teacher
 * entered it from a sheet. Returns what happened, or the reason it was not (Hebrew).
 *
 * Imports bring in work the students already handed the teacher another way -
 * typically for a lesson added to the site late - so an imported submission is
 * not marked late just because the import itself came after the deadline.
 */
async function recordImportedRepo(
  assignmentId: string,
  student: { id: string; email: string; githubUsername: string | null },
  repoName: string,
): Promise<'imported' | 'unchanged' | string> {
  // A bare repo name belongs to the student's own GitHub account; any
  // other owner has to be written out, so no link is ever guessed.
  const ref = parseRepoRef(repoName);
  if (!ref) return `"${repoName}" אינו שם ריפו תקין - יש לכתוב שם ריפו, owner/repo או קישור מלא ל-GitHub`;
  const owner = ref.owner ?? student.githubUsername;
  if (!owner) return `ל-${student.email} לא מוגדר שם משתמש GitHub - יש לכתוב owner/repo או קישור מלא במקום שם הריפו בלבד`;
  const githubUrl = `https://github.com/${owner}/${ref.repo}`;

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
  });
  if (existing?.githubUrl?.toLowerCase() === githubUrl.toLowerCase()) return 'unchanged';

  const repoStatus = await getRepoStatus(owner, ref.repo);
  if (repoStatus === 'missing') return `הריפו github.com/${owner}/${ref.repo} לא נמצא (או שאינו ציבורי)`;
  if (repoStatus === 'unknown') {
    return `לא ניתן היה לאמת את github.com/${owner}/${ref.repo} מול GitHub - השורה לא יובאה, יש לנסות לייבא אותה שוב מאוחר יותר`;
  }

  if (existing) {
    await prisma.submission.update({ where: { id: existing.id }, data: { githubUrl, submittedAt: new Date() } });
  } else {
    await prisma.submission.create({ data: { assignmentId, studentId: student.id, githubUrl, isLate: false } });
  }
  return 'imported';
}

const ASSIGNMENT_IMPORT_HEADERS = ['שם (רשות)', 'מייל התלמידה', 'ריפו (שם, owner/repo או קישור)'];

async function assignmentWithCourse(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, title: true, lesson: { select: { course: { select: { id: true, groupId: true } } } } },
  });
  if (!assignment) throw new AppError('Assignment not found', 'המטלה לא נמצאה', 404);
  return assignment;
}

/**
 * The sheet for importing one assignment's submissions: every student of its
 * course already listed, with the repo she submitted (if any), so the teacher
 * only fills in the missing repos.
 */
export async function buildAssignmentSubmissionsTemplate(assignmentId: string): Promise<Buffer> {
  const assignment = await assignmentWithCourse(assignmentId);
  const { id: courseId, groupId } = assignment.lesson.course;
  const roster = await loadRoster(courseId, groupId);
  const submitted = new Map(
    (await prisma.submission.findMany({ where: { assignmentId }, select: { studentId: true, githubUrl: true } }))
      .map((s) => [s.studentId, s.githubUrl ?? ''])
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('הגשות', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  sheet.addRow(ASSIGNMENT_IMPORT_HEADERS);
  sheet.getRow(1).font = { bold: true };
  for (const s of roster) sheet.addRow([s.name, s.email, submitted.get(s.id) ?? '']);
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 50;

  const help = workbook.addWorksheet('הוראות', { views: [{ rightToLeft: true }] });
  for (const line of [
    `הגשות למטלה "${assignment.title}"`,
    'כל שורה היא תלמידה בקורס. ממלאים את הריפו רק למי שהגישה - שורה בלי ריפו מדלגים עליה.',
    'בעמודת הריפו אפשר לכתוב קישור מלא, owner/repo, או רק את שם הריפו (אז הוא נלקח מחשבון ה-GitHub של התלמידה).',
    'ריפו שכבר מופיע הוא ההגשה הקיימת. שינוי שלו מחליף אותה.',
    'הגשה שהמורה מייבאת לא נחשבת הגשה באיחור.',
  ]) help.addRow([line]);
  help.getRow(1).font = { bold: true };
  help.getColumn(1).width = 100;
  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

/** Imports one assignment's submissions from the sheet above. */
export async function importAssignmentSubmissions(assignmentId: string, buffer: Buffer) {
  const assignment = await assignmentWithCourse(assignmentId);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new AppError('Unreadable workbook', 'לא הצלחנו לקרוא את הקובץ. יש להעלות קובץ אקסל (xlsx.)', 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('Empty workbook', 'הקובץ ריק', 400);

  const { id: courseId, groupId } = assignment.lesson.course;
  const roster = await loadRoster(courseId, groupId);
  const byEmail = new Map(roster.map((s) => [s.email.toLowerCase(), s]));
  const githubOf = new Map(
    (await prisma.user.findMany({ where: { id: { in: roster.map((s) => s.id) } }, select: { id: true, githubUsername: true } }))
      .map((u) => [u.id, u.githubUsername])
  );

  const rows: { rowNumber: number; email: string; repo: string }[] = [];
  const errors: string[] = [];
  let empty = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const email = cellText(row.getCell(2)).trim().toLowerCase();
    const repo = cellText(row.getCell(3)).trim();
    if (!repo) { empty++; return; }
    if (!email) { errors.push(`שורה ${rowNumber}: חסר מייל`); return; }
    rows.push({ rowNumber, email, repo });
  });

  let imported = 0;
  let unchanged = 0;
  for (const { rowNumber, email, repo } of rows) {
    const student = byEmail.get(email);
    if (!student) { errors.push(`שורה ${rowNumber}: ${email} אינה תלמידה בקורס של המטלה`); continue; }
    try {
      const outcome = await recordImportedRepo(
        assignmentId, { id: student.id, email: student.email, githubUsername: githubOf.get(student.id) ?? null }, repo,
      );
      if (outcome === 'imported') imported++;
      else if (outcome === 'unchanged') unchanged++;
      else errors.push(`שורה ${rowNumber}: ${outcome}`);
    } catch {
      errors.push(`שורה ${rowNumber}: שגיאה בשמירת ההגשה של ${email}`);
    }
  }
  return { imported, unchanged, empty, errors };
}

export async function importSubmissions(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const rows: Array<{ rowNumber: number; assignmentTitle: string; studentEmail: string; repoName: string }> = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const assignmentTitle = cellText(row.getCell(1)).trim();
    const studentEmail = cellText(row.getCell(2)).trim().toLowerCase();
    const repoName = cellText(row.getCell(3)).trim();
    if (!assignmentTitle || !studentEmail || !repoName) {
      errors.push(`שורה ${rowNumber}: חסרים נתונים`);
      return;
    }
    rows.push({ rowNumber, assignmentTitle, studentEmail, repoName });
  });

  for (const { rowNumber, assignmentTitle, studentEmail, repoName } of rows) {
    try {
      const student = await prisma.user.findUnique({
        where: { email: studentEmail },
        include: { studentGroups: { select: { groupId: true } }, courseAccess: { select: { courseId: true } } },
      });
      if (!student || student.role !== 'STUDENT') {
        errors.push(`שורה ${rowNumber}: לא נמצאה תלמידה עם המייל ${studentEmail}`); skipped++; continue;
      }

      // Titles repeat across courses (every group's "תרגיל 1"), so the title
      // alone can't pick the assignment: narrow it to the courses this student
      // belongs to, and refuse to guess when that still leaves more than one.
      const sameTitle = await prisma.assignment.findMany({
        where: { title: assignmentTitle },
        select: { id: true, deadline: true, lesson: { select: { course: { select: { id: true, groupId: true } } } } },
      });
      if (sameTitle.length === 0) {
        errors.push(`שורה ${rowNumber}: לא נמצאה מטלה בשם "${assignmentTitle}"`); skipped++; continue;
      }
      const groupIds = new Set(student.studentGroups.map((g) => g.groupId));
      const courseIds = new Set(student.courseAccess.map((c) => c.courseId));
      const candidates = sameTitle.filter((a) =>
        groupIds.has(a.lesson.course.groupId) || courseIds.has(a.lesson.course.id));
      if (candidates.length === 0) {
        errors.push(`שורה ${rowNumber}: ${studentEmail} אינה רשומה לקורס של המטלה "${assignmentTitle}"`); skipped++; continue;
      }
      if (candidates.length > 1) {
        errors.push(`שורה ${rowNumber}: יש כמה מטלות בשם "${assignmentTitle}" בקורסים של ${studentEmail} - יש לשנות את שם המטלה כך שיהיה ייחודי`);
        skipped++; continue;
      }
      const assignment = candidates[0];

      const outcome = await recordImportedRepo(assignment.id, student, repoName);
      if (outcome === 'imported' || outcome === 'unchanged') imported++;
      else { errors.push(`שורה ${rowNumber}: ${outcome}`); skipped++; }
    } catch {
      errors.push(`שורה ${rowNumber}: שגיאה בעיבוד ${studentEmail} / ${assignmentTitle}`);
    }
  }

  return { imported, skipped, errors };
}
