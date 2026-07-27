import type { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection } from '../infrastructure/redis/connection';
import { deadlineQueue, storageQueue } from '../infrastructure/queues/queues';
import { registerEmailWorker } from './email.worker';
import { registerQuizWorker } from './quiz.worker';
import { registerAiReviewWorker } from './ai-review.worker';
import { registerDeadlineWorker } from './deadline.worker';
import { registerStorageWorker } from './storage.worker';

export interface WorkerHandles {
  workers: Worker[];
  connections: IORedis[];
}

/**
 * Create and start every worker. Called once — from the standalone worker entry
 * (entrypoints/worker.ts) or, on the free single-service deploy, inline from the
 * combined entry (entrypoints/combined.ts). Each worker gets its own Redis
 * connection because workers issue blocking reads.
 */
export async function startWorkers(): Promise<WorkerHandles> {
  const connections: IORedis[] = [];
  const conn = (label: string): IORedis => {
    const c = createRedisConnection(label);
    connections.push(c);
    return c;
  };

  const workers: Worker[] = [
    registerEmailWorker(conn('email-worker')),
    registerQuizWorker(conn('quiz-worker')),
    registerAiReviewWorker(conn('ai-review-worker')),
    registerDeadlineWorker(conn('deadline-worker')),
    registerStorageWorker(conn('storage-worker')),
  ];

  await registerRepeatableJobs();
  console.log(`[workers] started ${workers.length} workers`);
  return { workers, connections };
}

// Repeatable jobs — deadline reports every 15 min, storage monitoring every hour.
// A stable jobId per queue means re-running this on every restart upserts the
// same schedule instead of stacking duplicates. Errors are logged, not thrown,
// so startup never crashes if Redis is momentarily unavailable.
async function registerRepeatableJobs(): Promise<void> {
  try {
    await deadlineQueue.add('check', {}, { repeat: { every: 15 * 60 * 1000 }, jobId: 'repeat' });
    await storageQueue.add('check', {}, { repeat: { every: 60 * 60 * 1000 }, jobId: 'repeat' });
    console.log('[workers] Repeatable jobs registered (deadline-check, storage-monitor)');
  } catch (err) {
    console.error('[workers] Failed to register repeatable jobs:', err);
  }
}

export async function stopWorkers(handles: WorkerHandles): Promise<void> {
  await Promise.all(handles.workers.map((w) => w.close()));
  await Promise.all(handles.connections.map((c) => c.quit().catch(() => c.disconnect())));
}
