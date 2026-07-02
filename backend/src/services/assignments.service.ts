import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';

export async function getAssignments(lessonId: string) {
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
    const lessonId = String(row.getCell(1).value ?? '').trim();
    const title = String(row.getCell(2).value ?? '').trim();
    const description = String(row.getCell(3).value ?? '').trim() || undefined;
    const deadline = String(row.getCell(4).value ?? '').trim() || undefined;
    const allowedTypesRaw = String(row.getCell(5).value ?? '').trim();
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
      aiCodeReview: s.aiCodeReview, aiVerbalReview: s.aiVerbalReview,
      grade: s.grade ? {
        score: s.grade.score, feedback: s.grade.feedback,
        checklist: s.grade.checklist, gradedAt: s.grade.gradedAt,
      } : null,
    })),
  };
}
