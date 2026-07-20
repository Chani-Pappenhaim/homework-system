import { Worker } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../config/prisma';
import { connection } from '../config/redis';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const quizWorker = new Worker(
  'quiz',
  async (job) => {
    const { lessonId, lessonContent } = job.data;

    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a quiz generator for a coding course.
Based on the following lesson content, create exactly 10 multiple choice questions in Hebrew.
Each question must have exactly 4 options. Only one is correct.

Return ONLY a valid JSON array with this exact structure, no other text:
[{"id":"1","question":"...","options":["...","...","...","..."],"correctIndex":0}]

Lesson content:
${lessonContent}`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const questions = JSON.parse(text);
    await prisma.quiz.upsert({
      where: { lessonId },
      create: { lessonId, questions },
      update: { questions },
    });
  },
  { connection }
);

quizWorker.on('error', (err) => console.error('[quiz] worker error:', err));
quizWorker.on('failed', (job, err) => console.error(`[quiz] job ${job?.id} failed:`, err.message));
