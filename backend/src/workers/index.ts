import { Queue } from 'bullmq';

function redisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port) || 6379 };
}

export const connection = redisConnection();
export const quizQueue = new Queue('quiz', { connection });
export const emailQueue = new Queue('email', { connection });

import './quiz.worker';
import './email.worker';
import './storage.worker';
