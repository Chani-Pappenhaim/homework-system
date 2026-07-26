import { prisma } from '../config/prisma';
import { uploadBuffer } from '../utils/storage';
import { assertLessonAccess } from '../utils/access';
import { computeSubmissionScore } from '../utils/grading';
import ExcelJS from 'exceljs';

export async function submitAssignment(
  assignmentId: string, studentId: string,
  payload: {
    repoName?: string;
    notes?: string;
    checklist?: unknown;
    file?: { buffer: Buffer; originalName: string; mimeType: string };
  }
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { lesson: { include: { course: true } } },
  });
  if (!assignment) throw Object.assign(new Error('Assignment not found'), { status: 404 });

  await assertLessonAccess(studentId, 'STUDENT', assignment.lessonId);

  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let githubUrl: string | undefined;

  if (payload.repoName) {
    if (!assignment.allowGithub) throw Object.assign(new Error('GitHub not allowed for this assignment'), { status: 400 });
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student?.githubUsername) throw Object.assign(new Error('No GitHub username set for your account'), { status: 400 });
    githubUrl = `https://github.com/${student.githubUsername}/${payload.repoName}`;
  } else if (payload.file) {
    if (!assignment.allowFile) throw Object.assign(new Error('File upload not allowed for this assignment'), { status: 400 });
    if (assignment.allowedTypes.length > 0) {
      const ext = payload.file.originalName.split('.').pop()?.toLowerCase() ?? '';
      if (!assignment.allowedTypes.includes(ext)) {
        throw Object.assign(new Error(`File type not allowed. Allowed: ${assignment.allowedTypes.join(', ')}`), { status: 400 });
      }
    }
    const uploaded = await uploadBuffer(payload.file.buffer, payload.file.mimeType, 'submissions');
    fileUrl = uploaded.url;
    fileName = payload.file.originalName;
  } else {
    throw Object.assign(new Error('No file or repo name provided'), { status: 400 });
  }

  const isLate = assignment.deadline ? new Date() > assignment.deadline : false;
  const notes = payload.notes ?? null;
  // undefined leaves the stored checklist untouched on resubmit; a real array replaces it.
  const checklist = payload.checklist === undefined ? undefined : (payload.checklist as any);

  const existing = await prisma.submission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId } },
  });

  const submission = existing
    ? await prisma.submission.update({
        where: { id: existing.id },
        data: { fileUrl, fileName, githubUrl, notes, checklist, submittedAt: new Date(), isLate },
      })
    : await prisma.submission.create({
        data: { assignmentId, studentId, fileUrl, fileName, githubUrl, notes, checklist, isLate },
      });

  // ציון הגשה אוטומטי — נראה לתלמידה מיד. משאיר contentScore/feedback אם המורה כבר נתנה.
  const submissionScore = computeSubmissionScore(isLate, submission.checklist);
  await prisma.grade.upsert({
    where: { submissionId: submission.id },
    create: { submissionId: submission.id, submissionScore },
    update: { submissionScore },
  });

  return submission;
}

interface SubmissionAiFields {
  aiStatus: string;
  aiScore: number | null;
  aiApproved: boolean;
  aiCodeReview: string | null;
  aiVerbalReview: string | null;
}

/**
 * What a student is allowed to see of an AI review.
 *
 * The code review is hers as soon as it is ready; the score and the verbal
 * summary are the teacher's call and stay server-side until she approves.
 * Hiding them in the client is not hiding them — the values were being sent
 * over the wire and were visible in devtools.
 */
export function toStudentAiView(sub: SubmissionAiFields) {
  const base = {
    aiStatus: sub.aiStatus,
    aiApproved: sub.aiApproved,
    aiCodeReview: sub.aiStatus === 'done' ? sub.aiCodeReview : null,
  };
  if (!sub.aiApproved) {
    return { ...base, aiScore: null, aiVerbalReview: null };
  }
  return { ...base, aiScore: sub.aiScore, aiVerbalReview: sub.aiVerbalReview };
}

export async function getMySubmissions(studentId: string) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: {
      studentGroups: { select: { groupId: true } },
      lessonAccess: { select: { lessonId: true } },
    },
  });
  const groupIds = student?.studentGroups.map((sg) => sg.groupId) ?? [];
  const accessLessonIds = student?.lessonAccess.map((la) => la.lessonId) ?? [];

  const allAssignments = await prisma.assignment.findMany({
    where: {
      lesson: {
        hidden: false,
        OR: [
          { course: { hidden: false, groupId: { in: groupIds } } },
          { id: { in: accessLessonIds } },
        ],
      },
    },
    include: {
      lesson: { select: { topic: true, course: { select: { name: true } } } },
      submissions: { where: { studentId } },
    },
  });

  const pending = [];
  const submitted = [];

  for (const assignment of allAssignments) {
    const sub = assignment.submissions[0];
    if (!sub) {
      pending.push({
        assignmentId: assignment.id, assignmentTitle: assignment.title,
        lessonTopic: assignment.lesson.topic, courseName: assignment.lesson.course.name,
        deadline: assignment.deadline,
      });
    } else {
      const grade = await prisma.grade.findUnique({ where: { submissionId: sub.id } });
      submitted.push({
        submissionId: sub.id, id: sub.id,
        assignmentId: assignment.id, assignmentTitle: assignment.title,
        lessonTopic: assignment.lesson.topic, courseName: assignment.lesson.course.name,
        submittedAt: sub.submittedAt, isLate: sub.isLate, notes: sub.notes,
        checklist: sub.checklist,
        githubUrl: sub.githubUrl, fileUrl: sub.fileUrl, fileName: sub.fileName,
        ...toStudentAiView(sub),
        grade: grade ? { submissionScore: grade.submissionScore, contentScore: sub.aiApproved ? grade.contentScore : null, feedback: grade.feedback, checklist: grade.checklist } : null,
      });
    }
  }

  pending.sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.getTime() - b.deadline.getTime();
  });

  return { pending, submitted };
}

export async function getSubmissionById(id: string, userId: string, role: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { grade: true },
  });
  if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });
  if (role !== 'ADMIN' && submission.studentId !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  if (role === 'ADMIN') return submission;
  // The content score is the teacher's call and stays hidden until she approves
  // the AI review; the submission score is always the student's to see.
  const grade = submission.grade
    ? { ...submission.grade, contentScore: submission.aiApproved ? submission.grade.contentScore : null }
    : submission.grade;
  return { ...submission, grade, ...toStudentAiView(submission) };
}

export async function importSubmissions(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const rows: Array<{ assignmentTitle: string; studentEmail: string; repoName: string }> = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const assignmentTitle = String(row.getCell(1).value ?? '').trim();
    const studentEmail = String(row.getCell(2).value ?? '').trim();
    const repoName = String(row.getCell(3).value ?? '').trim();
    if (!assignmentTitle || !studentEmail || !repoName) {
      errors.push(`Row ${rowNumber}: missing data`);
      return;
    }
    rows.push({ assignmentTitle, studentEmail, repoName });
  });

  for (const { assignmentTitle, studentEmail, repoName } of rows) {
    try {
      const student = await prisma.user.findUnique({ where: { email: studentEmail } });
      if (!student) { errors.push(`Student not found: ${studentEmail}`); skipped++; continue; }

      const assignment = await prisma.assignment.findFirst({ where: { title: assignmentTitle } });
      if (!assignment) { errors.push(`Assignment not found: ${assignmentTitle}`); skipped++; continue; }

      const githubUrl = student.githubUsername
        ? `https://github.com/${student.githubUsername}/${repoName}`
        : `https://github.com/${repoName}`;

      const existing = await prisma.submission.findUnique({
        where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: student.id } },
      });

      if (existing) {
        await prisma.submission.update({
          where: { id: existing.id },
          data: { githubUrl, submittedAt: new Date() },
        });
      } else {
        const isLate = assignment.deadline ? new Date() > assignment.deadline : false;
        await prisma.submission.create({
          data: { assignmentId: assignment.id, studentId: student.id, githubUrl, isLate },
        });
      }
      imported++;
    } catch {
      errors.push(`Failed: ${studentEmail} / ${assignmentTitle}`);
    }
  }

  return { imported, skipped, errors };
}
