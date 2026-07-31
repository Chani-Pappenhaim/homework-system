import { Queue, DefaultJobOptions } from 'bullmq';
import { sharedConnection } from '../redis/connection';
import type { EmailJobData, QuizJobData, AiReviewJobData } from './job-types';

// Shared, deliberately moderate defaults for every queue: a few retries with
// exponential backoff for transient failures, and automatic cleanup so Redis
// does not grow without bound. Per-add options still override these.
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 100 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

// Producers only ever create/enqueue jobs — they never import a worker. All
// queues share one connection (queue producers are non-blocking).
export const emailQueue = new Queue<EmailJobData>('email', {
  connection: sharedConnection,
  defaultJobOptions,
});

export const quizQueue = new Queue<QuizJobData>('quiz', {
  connection: sharedConnection,
  defaultJobOptions,
});

export const aiReviewQueue = new Queue<AiReviewJobData>('ai-review', {
  connection: sharedConnection,
  defaultJobOptions,
});

// deadline-check and storage-monitor are NOT BullMQ queues: nothing ever
// enqueues an external job into them, they only ever ran their own
// self-triggered repeatable job. Giving a purely self-scheduled periodic task
// a full BullMQ Queue + Worker (its own blocking Redis connection, idle
// long-polling, stalled-job checks) buys nothing over a plain in-process
// setInterval — see workers/scheduled-tasks.ts.
export const allQueues = [emailQueue, quizQueue, aiReviewQueue];

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map((q) => q.close()));
}
