import { Worker } from 'bullmq';
import { connection } from './index';
import { prisma } from '../config/prisma';
import { fetchGithubCode, reviewCode } from '../services/gemini.service';

new Worker(
  'ai-review',
  async (job) => {
    const { submissionId } = job.data;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true, student: true },
    });
    if (!submission) throw new Error('Submission not found');

    let code = '';
    if (submission.githubUrl) {
      code = await fetchGithubCode(submission.githubUrl);
    } else {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { aiStatus: 'error' },
      });
      throw new Error('No GitHub URL on submission');
    }

    const result = await reviewCode(
      code,
      submission.assignment.title,
      submission.assignment.aiInstructions
    );

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        aiStatus: 'done',
        aiScore: result.score,
        aiCodeReview: result.codeReview,
        aiVerbalReview: result.verbalReview,
        aiReviewCount: { increment: 1 },
      },
    });
  },
  { connection }
);
