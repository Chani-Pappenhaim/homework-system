import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '../config/prisma';
import { sharedConnection } from '../infrastructure/redis/connection';
import { emailQueue } from '../infrastructure/queues/queues';
import type { DeadlineJobData } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';

const REPORT_TTL_SECONDS = 30 * 24 * 60 * 60; // remember sent reports for 30 days
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000; // ignore deadlines older than 7 days

export function registerDeadlineWorker(connection: IORedis): Worker<DeadlineJobData> {
  const worker = new Worker<DeadlineJobData>(
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
        // Dedup key ops use the shared (non-blocking) connection, not the worker's
        // own blocking connection.
        if (await sharedConnection.get(sentKey)) continue;

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
        console.log(`[deadline] Report enqueued for assignment "${assignment.title}" (${assignment.id})`);
      }
    },
    { connection }
  );
  attachLifecycleLogging(worker, 'deadline');
  return worker;
}
