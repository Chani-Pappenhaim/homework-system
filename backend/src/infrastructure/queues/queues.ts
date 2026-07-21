import { Queue, DefaultJobOptions } from 'bullmq';
import { sharedConnection } from '../redis/connection';
import type {
  EmailJobData,
  QuizJobData,
  AiReviewJobData,
  DeadlineJobData,
  StorageJobData,
} from './job-types';

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

export const deadlineQueue = new Queue<DeadlineJobData>('deadline-check', {
  connection: sharedConnection,
  defaultJobOptions,
});

export const storageQueue = new Queue<StorageJobData>('storage-monitor', {
  connection: sharedConnection,
  defaultJobOptions,
});

export const allQueues = [emailQueue, quizQueue, aiReviewQueue, deadlineQueue, storageQueue];

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map((q) => q.close()));
}
