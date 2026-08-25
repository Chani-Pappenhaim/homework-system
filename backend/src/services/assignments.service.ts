import { prisma } from '../config/prisma';
import { assertLessonAccess } from '../utils/access';
import { cellText } from '../utils/excel';
import ExcelJS from 'exceljs';

export async function getAssignments(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);
  return prisma.assignment.findMany({ where: { lessonId }, orderBy: { createdAt: 'asc' } });
}

export async function createAssignment(lessonId: string, data: {
  title: string; description?: string; deadline?: string;
  allowedTypes?: string[]; allowGithub?: boolean; allowFile?: boolean;
  requirements?: { id: string; text: string }[];
  aiInstructions?: string;
}) {
  const { deadline, ...rest } = data;
  return prisma.assignment.create({
    data: { lessonId, ...rest, ...(deadline ? { deadline: new Date(deadline) } : {}) },
  });
}

export async function updateAssignment(id: string, data: Partial<{
  title: string; description: string; deadline: string;
  allowedTypes: string[]; allowGithub: boolean; allowFile: boolean;
  requirements: { id: string; text: string }[];
  aiInstructions: string;
}>) {
  const { deadline, ...rest } = data;
  return prisma.assignment.update({
    where: { id },
    data: { ...rest, ...(deadline ? { deadline: new Date(deadline) } : {}) },
  });
}

export async function deleteAssignment(id: string) {
  await prisma.assignment.delete({ where: { id } });
}

export async function importAssignments(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];

  let imported = 0;
  const errors: string[] = [];

  for (let i = 2; i <= (sheet.lastRow?.number ?? 1); i++) {
    const row = sheet.getRow(i);
    const lessonId = cellText(row.getCell(1)).trim();
    const title = cellText(row.getCell(2)).trim();
    const description = cellText(row.getCell(3)).trim() || undefined;
    const deadline = cellText(row.getCell(4)).trim() || undefined;
    const allowedTypesRaw = cellText(row.getCell(5)).trim();
    const allowedTypes = allowedTypesRaw ? allowedTypesRaw.split(',').map((s) => s.trim()) : [];

    if (!lessonId || !title) { errors.push(`Row ${i}: missing lessonId or title`); continue; }

    try {
      await prisma.assignment.create({ data: { lessonId, title, description, deadline: deadline ? new Date(deadline) : undefined, allowedTypes } });
      imported++;
    } catch {
      errors.push(`Row ${i}: failed to create assignment`);
    }
  }
  return { imported, errors };
}

export async function getAssignmentSubmissions(assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw Object.assign(new Error('Assignment not found'), { status: 404 });

  const submissions = await prisma.submission.findMany({
    where: { assignmentId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      grade: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  return {
    assignment,
    submissions: submissions.map((s) => ({
      id: s.id, studentId: s.studentId,
      studentName: s.student.name, studentEmail: s.student.email,
      fileUrl: s.fileUrl, fileName: s.fileName, githubUrl: s.githubUrl,
      notes: s.notes,
      submittedAt: s.submittedAt, isLate: s.isLate,
      aiStatus: s.aiStatus, aiScore: s.aiScore, aiApproved: s.aiApproved,
      aiCodeReview: s.aiCodeReview, aiVerbalReview: s.aiVerbalReview, aiExtraAllowed: s.aiExtraAllowed,
      grade: s.grade ? {
        submissionScore: s.grade.submissionScore, contentScore: s.grade.contentScore,
        feedback: s.grade.feedback,
        checklist: s.grade.checklist, gradedAt: s.grade.gradedAt,
      } : null,
    })),
  };
}
