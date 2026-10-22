import { prisma } from '../config/prisma';

/** Assignments whose deadline passed within the last `lookbackMs`, with what is needed to report on them. */
export async function findRecentlyDueAssignments(now: Date, lookbackMs: number) {
  return prisma.assignment.findMany({
    where: { deadline: { lt: now, gt: new Date(now.getTime() - lookbackMs) } },
    include: {
      lesson: { include: { course: true } },
      submissions: { select: { studentId: true, submittedAt: true, isLate: true } },
    },
  });
}

export type DueAssignment = Awaited<ReturnType<typeof findRecentlyDueAssignments>>[number];

/** One row per student of the course's group: submitted, late or missing. */
export async function buildDeadlineReportRows(assignment: DueAssignment) {
  const groupStudents = await prisma.studentGroup.findMany({
    where: { groupId: assignment.lesson.course.groupId },
    include: { student: { select: { id: true, name: true } } },
  });

  return groupStudents.map(({ student }) => {
    const submission = assignment.submissions.find((s) => s.studentId === student.id);
    if (!submission) {
      return { name: student.name, status: 'missing' as const };
    }
    return {
      name: student.name,
      status: submission.isLate ? ('late' as const) : ('submitted' as const),
      submittedAt: submission.submittedAt,
    };
  });
}
