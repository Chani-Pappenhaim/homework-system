import type { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { createRedisConnection } from '../infrastructure/redis/connection';
import { registerEmailWorker } from './email.worker';
import { registerQuizWorker } from './quiz.worker';
import { registerAiReviewWorker } from './ai-review.worker';
import { startScheduledTasks, stopScheduledTasks, ScheduledTaskHandles } from './scheduled-tasks';

export interface WorkerHandles {
  workers: Worker[];
  connections: IORedis[];
  scheduledTasks: ScheduledTaskHandles;
}

/**
 * Create and start every worker. Called once — from the standalone worker entry
 * (entrypoints/worker.ts) or, on the free single-service deploy, inline from the
 * combined entry (entrypoints/combined.ts). Each worker gets its own Redis
 * connection because workers issue blocking reads. deadline-check and
 * storage-monitor are not BullMQ workers — see scheduled-tasks.ts.
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
  ];

  const scheduledTasks = startScheduledTasks();
  console.log(`[workers] started ${workers.length} workers`);
  return { workers, connections, scheduledTasks };
}

export async function stopWorkers(handles: WorkerHandles): Promise<void> {
  stopScheduledTasks(handles.scheduledTasks);
  await Promise.all(handles.workers.map((w) => w.close()));
  await Promise.all(handles.connections.map((c) => c.quit().catch(() => c.disconnect())));
}
