import { emailQueue } from './queues';
import type { EmailJobMap } from './job-types';

// Adds an email job without ever failing the caller: a queue outage must not
// roll back the business action that triggered the notification.
export async function enqueueEmail<T extends keyof EmailJobMap>(jobName: T, data: EmailJobMap[T]): Promise<void> {
  try {
    await emailQueue.add(jobName, data);
  } catch (err) {
    console.error(`Failed to enqueue ${jobName} email:`, err);
  }
}
