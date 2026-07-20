import { Worker } from 'bullmq';
import { connection } from '../config/redis';
import { prisma } from '../config/prisma';
import { fetchGithubCode, extractZipCode, extractDocxText, reviewCode } from '../services/gemini.service';

async function downloadFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download submission file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const aiReviewWorker = new Worker(
  'ai-review',
  async (job) => {
    const { submissionId } = job.data;

    // Anything that throws below leaves aiStatus at 'pending', and requestAiReview
    // refuses to re-enqueue while pending — so a private repo or a Gemini blip used
    // to lock the student out of her review permanently. Always land on a terminal
    // status before rethrowing.
    try {
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
    } catch (err) {
      // Only give up once BullMQ has exhausted its retries; a transient failure
      // should not burn the student's single review attempt.
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await prisma.submission
          .update({ where: { id: submissionId }, data: { aiStatus: 'error' } })
          .catch(() => {});
      }
      throw err;
    }
  },
  { connection }
);

// An unhandled 'error' event on a BullMQ Worker would crash the process.
aiReviewWorker.on('error', (err) => console.error('[ai-review] worker error:', err));
aiReviewWorker.on('failed', (job, err) =>
  console.error(`[ai-review] job ${job?.id} failed:`, err.message)
);
