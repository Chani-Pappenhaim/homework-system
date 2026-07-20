import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Single shared Redis connection for the whole process. It is built directly from
// REDIS_URL (not split into host/port) so username, password and TLS from a
// managed `rediss://` URL are preserved. maxRetriesPerRequest: null is required by
// BullMQ workers. Every queue, worker and dedup get/setex call reuses this one
// connection — BullMQ duplicates it internally for its blocking reads.
export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => console.error('[redis] connection error:', err));
connection.on('connect', () => console.log('[redis] connected'));

export const quizQueue = new Queue('quiz', { connection });
export const emailQueue = new Queue('email', { connection });
export const aiReviewQueue = new Queue('ai-review', { connection });
export const deadlineQueue = new Queue('deadline-check', { connection });
export const storageQueue = new Queue('storage-monitor', { connection });
