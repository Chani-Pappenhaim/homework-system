import { deadlineQueue, storageQueue } from '../config/redis';

// Worker process entrypoint. Importing each worker file registers its BullMQ
// Worker against the shared connection in ../config/redis. Only this process
// (the `worker` container) imports these files — the API imports queues straight
// from ../config/redis, so it never spins up workers of its own.
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
