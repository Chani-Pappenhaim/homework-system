import { prisma } from '../config/prisma';
import { sharedConnection } from '../infrastructure/redis/connection';
import { emailQueue } from '../infrastructure/queues/queues';

const REPORT_TTL_SECONDS = 30 * 24 * 60 * 60; // remember sent reports for 30 days
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // ignore deadlines older than 7 days

// Redis is the durable record of which reports were sent — it has to be, since
// the answer must survive a restart. But an assignment stays inside the 7-day
// lookback for ~168 hourly runs, and asking Redis the same settled question 168
// times is 167 commands spent to re-learn something that cannot change back.
// Once a report is known sent, remember it here and stop asking; a restart
// costs one lookup per assignment to repopulate, and the TTL above still owns
// expiry. Cleared alongside the key it mirrors so the two never disagree.
const reportedAssignments = new Set<string>();

// Same logic that used to run inside a BullMQ 'deadline-check' Worker driven
// by a repeatable job — see scheduled-tasks.ts for why this is now a plain
// interval instead.
export async function runDeadlineCheck(): Promise<void> {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - LOOKBACK_MS);

  // Deadlines that passed recently — avoids spamming ancient deadlines on first deploy
  const assignments = await prisma.assignment.findMany({
    where: { deadline: { lt: now, gt: lookbackStart } },
    include: {
      lesson: { include: { course: true } },
      submissions: { select: { studentId: true, submittedAt: true, isLate: true } },
    },
  });

  for (const assignment of assignments) {
    if (reportedAssignments.has(assignment.id)) continue;

    const sentKey = `deadline_report_sent:${assignment.id}`;
    if (await sharedConnection.get(sentKey)) {
      reportedAssignments.add(assignment.id);
      continue;
    }

    const groupStudents = await prisma.studentGroup.findMany({
      where: { groupId: assignment.lesson.course.groupId },
      include: { student: { select: { id: true, name: true } } },
    });

    const rows = groupStudents.map(({ student }) => {
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

    await emailQueue.add('deadline-report', {
      assignmentTitle: assignment.title,
      courseName: assignment.lesson.course.name,
      deadline: assignment.deadline,
      rows,
    });
    await sharedConnection.setex(sentKey, REPORT_TTL_SECONDS, '1');
    reportedAssignments.add(assignment.id);
    console.log(`[deadline] Report enqueued for assignment "${assignment.title}" (${assignment.id})`);
  }
}
