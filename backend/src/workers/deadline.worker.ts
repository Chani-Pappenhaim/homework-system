import { Worker } from 'bullmq';
import { prisma } from '../config/prisma';
import { connection, emailQueue } from '../config/redis';

const REPORT_TTL_SECONDS = 30 * 24 * 60 * 60; // remember sent reports for 30 days
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // ignore deadlines older than 7 days

const deadlineWorker = new Worker(
  'deadline-check',
  async () => {
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
      const sentKey = `deadline_report_sent:${assignment.id}`;
      if (await connection.get(sentKey)) continue;

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
      await connection.setex(sentKey, REPORT_TTL_SECONDS, '1');
      console.log(`[deadline] Report enqueued for assignment "${assignment.title}" (${assignment.id})`);
    }
  },
  { connection }
);

deadlineWorker.on('error', (err) => console.error('[deadline] worker error:', err));
deadlineWorker.on('failed', (job, err) =>
  console.error(`[deadline] job ${job?.id} failed:`, err.message)
);
