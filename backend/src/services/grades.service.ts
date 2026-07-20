import { prisma } from '../config/prisma';
import ExcelJS from 'exceljs';

export async function gradeSubmission(
  submissionId: string, gradedById: string,
  data: { submissionScore?: number; contentScore?: number; feedback?: string; checklist?: { id: string; text: string; checked: boolean }[] }
) {
  return prisma.grade.upsert({
    where: { submissionId },
    create: { submissionId, gradedById, ...data },
    update: { ...data, gradedAt: new Date(), gradedById },
  });
}

export async function getReport(filters: { groupId?: string; courseId?: string }) {
  const submissions = await prisma.submission.findMany({
    where: {
      assignment: {
        lesson: {
          course: {
            ...(filters.groupId && { groupId: filters.groupId }),
            ...(filters.courseId && { id: filters.courseId }),
          },
        },
      },
    },
    include: {
      student: { include: { studentGroups: { include: { group: true } } } },
      assignment: { include: { lesson: { include: { course: true } } } },
      grade: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  return submissions.map((s) => ({
    studentName: s.student.name,
    studentEmail: s.student.email,
    groupName: s.student.studentGroups[0]?.group.name ?? '',
    courseName: s.assignment.lesson.course.name,
    lessonTopic: s.assignment.lesson.topic,
    assignmentTitle: s.assignment.title,
    deadline: s.assignment.deadline,
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    submissionScore: s.grade?.submissionScore ?? null,
    contentScore: s.grade?.contentScore ?? null,
    feedback: s.grade?.feedback ?? null,
    checklist: s.grade?.checklist ?? null,
  }));
}

export async function exportReport(filters: { groupId?: string; courseId?: string }): Promise<Buffer> {
  const rows = await getReport(filters);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Grades');
  sheet.addRow(['Student Name', 'Email', 'Group', 'Course', 'Lesson', 'Assignment', 'Deadline', 'Submitted', 'Late', 'Submission Score', 'Content Score', 'Feedback']);

  for (const r of rows) {
    sheet.addRow([
      r.studentName, r.studentEmail, r.groupName, r.courseName,
      r.lessonTopic, r.assignmentTitle,
      r.deadline?.toISOString() ?? '', r.submittedAt.toISOString(),
      r.isLate ? 'Yes' : 'No', r.submissionScore ?? '', r.contentScore ?? '', r.feedback ?? '',
    ]);
  }

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}

export async function getPendingGrades() {
  const submissions = await prisma.submission.findMany({
    where: { grade: null },
    include: {
      student: { select: { name: true } },
      assignment: { select: { title: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  return {
    count: submissions.length,
    submissions: submissions.map((s) => ({
      id: s.id, studentName: s.student.name,
      assignmentTitle: s.assignment.title, submittedAt: s.submittedAt,
    })),
  };
}
