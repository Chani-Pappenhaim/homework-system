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

      const questions = await generateQuiz(lessonContent);
      // Prisma's Json fields are typed strictly; cast the typed array to InputJsonValue.
      const questionsJson = questions as unknown as Prisma.InputJsonValue;

      // Generated questions always land as an unpublished draft until a teacher reviews them.
      await prisma.quiz.upsert({
        where: { lessonId },
        create: { lessonId, questions: questionsJson, published: false },
        update: { questions: questionsJson, published: false },
      });
    },
    { connection, ...defaultWorkerOptions }
  );
  attachLifecycleLogging(worker, 'quiz');
  return worker;
}
