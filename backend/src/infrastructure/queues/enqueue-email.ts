import { emailQueue } from './queues';
import type { EmailJobMap } from './job-types';

// Adds an email job without ever failing the caller: a queue outage must not
// roll back the business action that triggered the notification. `delay` holds
// the email back that many milliseconds.
export async function enqueueEmail<T extends keyof EmailJobMap>(
  jobName: T,
  data: EmailJobMap[T],
  options?: { delay?: number },
): Promise<void> {
  try {
    await emailQueue.add(jobName, data, options);
  } catch (err) {
    console.error(`Failed to enqueue ${jobName} email:`, err);
  }
}
