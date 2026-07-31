import { Worker } from 'bullmq';
import { Prisma } from '@prisma/client';
import type IORedis from 'ioredis';
import { prisma } from '../config/prisma';
import { generateQuiz } from '../services/gemini.service';
import type { QuizJobData } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';
import { defaultWorkerOptions } from './worker-defaults';

export function registerQuizWorker(connection: IORedis): Worker<QuizJobData> {
  const worker = new Worker<QuizJobData>(
    'quiz',
    async (job) => {
      const { lessonId, lessonContent } = job.data;

      // Same Gemini provider as the homework review — the one that connects here.
      const questions = await generateQuiz(lessonContent);
      // Prisma types Json fields strictly; the typed array needs a cast to InputJsonValue.
      const questionsJson = questions as unknown as Prisma.InputJsonValue;

      await prisma.quiz.upsert({
        where: { lessonId },
        create: { lessonId, questions: questionsJson },
        update: { questions: questionsJson },
      });
    },
    { connection, ...defaultWorkerOptions }
  );
  attachLifecycleLogging(worker, 'quiz');
  return worker;
}
