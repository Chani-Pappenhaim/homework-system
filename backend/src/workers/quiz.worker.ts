import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '../config/prisma';
import { generateQuiz } from '../services/gemini.service';
import type { QuizJobData } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';

export function registerQuizWorker(connection: IORedis): Worker<QuizJobData> {
  const worker = new Worker<QuizJobData>(
    'quiz',
    async (job) => {
      const { lessonId, lessonContent } = job.data;

      // Same Gemini provider as the homework review — the one that connects here.
      const questions = await generateQuiz(lessonContent);

      await prisma.quiz.upsert({
        where: { lessonId },
        create: { lessonId, questions },
        update: { questions },
      });
    },
    { connection }
  );
  attachLifecycleLogging(worker, 'quiz');
  return worker;
}
