import { Queue } from 'bullmq';

function redisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port) || 6379 };
}

export const connection = redisConnection();
export const quizQueue = new Queue('quiz', { connection });
export const emailQueue = new Queue('email', { connection });
export const aiReviewQueue = new Queue('ai-review', { connection });
export const deadlineQueue = new Queue('deadline-check', { connection });
export const storageQueue = new Queue('storage-monitor', { connection });

import './quiz.worker';
import './email.worker';
import './storage.worker';
import './ai-review.worker';
import './deadline.worker';

// Repeatable jobs — deadline reports every 15 min, storage monitoring every hour.
// Errors are logged, not thrown, so startup never crashes if Redis is down.
(async () => {
  try {
    await deadlineQueue.add('check', {}, { repeat: { every: 15 * 60 * 1000 }, jobId: 'repeat' });
    await storageQueue.add('check', {}, { repeat: { every: 60 * 60 * 1000 }, jobId: 'repeat' });
    console.log('[workers] Repeatable jobs registered (deadline-check, storage-monitor)');
  } catch (err) {
    console.error('[workers] Failed to register repeatable jobs:', err);
  }
})();
