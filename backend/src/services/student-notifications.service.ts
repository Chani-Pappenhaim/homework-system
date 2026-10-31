import { enqueueEmail } from '../infrastructure/queues/enqueue-email';
import type { EmailJobMap } from '../infrastructure/queues/job-types';
import { getQuietHours } from './settings.service';
import { quietDelayMs } from '../utils/quiet-hours';

/**
 * Emails a student about something the teacher did (a reply, a message, a
 * published grade). During the teacher's quiet hours the email is held in the
 * queue, which keeps it across restarts, and goes out when they end. What the
 * student sees on the site is not delayed.
 */
export async function enqueueStudentEmail<T extends keyof EmailJobMap>(jobName: T, data: EmailJobMap[T]): Promise<void> {
  const delay = quietDelayMs(new Date(), await getQuietHours());
  await enqueueEmail(jobName, data, delay > 0 ? { delay } : undefined);
}
