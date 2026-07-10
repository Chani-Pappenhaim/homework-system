import { Worker } from 'bullmq';
import { connection } from './index';
import { prisma } from '../config/prisma';
import { fetchGithubCode, extractZipCode, extractDocxText, reviewCode } from '../services/gemini.service';

async function downloadFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download submission file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

new Worker(
  'ai-review',
  async (job) => {
    const { submissionId } = job.data;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: true, student: true },
    });
    if (!submission) throw new Error('Submission not found');

    const fileRef = (submission.fileName || submission.fileUrl || '').toLowerCase();

    let code = '';
    if (submission.githubUrl) {
      code = await fetchGithubCode(submission.githubUrl);
    } else if (submission.fileUrl && fileRef.endsWith('.zip')) {
      code = extractZipCode(await downloadFile(submission.fileUrl));
    } else if (submission.fileUrl && fileRef.endsWith('.docx')) {
      code = await extractDocxText(await downloadFile(submission.fileUrl));
    } else {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { aiStatus: 'error' },
      });
      throw new Error(
        'Unsupported submission type for AI review: expected a GitHub URL, a .zip file, or a .docx file'
      );
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
