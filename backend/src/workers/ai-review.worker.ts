import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '../config/prisma';
import { reviewCode } from '../services/gemini.service';
import { fetchGithubCode, extractZipCode, extractDocxText } from '../utils/code-extraction';
import { toDeliveryUrl } from '../utils/storage';
import type { AiReviewJobData } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';
import { AiReviewInputError, aiReviewClientMessage } from '../utils/ai-review-errors';
import { defaultWorkerOptions } from './worker-defaults';

async function downloadFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download submission file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function registerAiReviewWorker(connection: IORedis): Worker<AiReviewJobData> {
  const worker = new Worker<AiReviewJobData>(
    'ai-review',
    async (job) => {
      const { submissionId, byTeacher } = job.data;

      // Anything that throws below leaves aiStatus at 'pending', and requestAiReview
      // refuses to re-enqueue while pending. Always land on a terminal status before
      // rethrowing, so a failure doesn't permanently block further review attempts.
      try {
        const submission = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { assignment: true, student: true },
        });
        if (!submission) throw new Error('Submission not found');

        const fileRef = (submission.fileName || submission.fileUrl || '').toLowerCase();

        let code = '';
        if (submission.githubUrl) {
          code = await fetchGithubCode(submission.githubUrl).catch((err) => {
            if (err?.status === 404) {
              throw new AiReviewInputError(
                err.message,
                'הריפו לא נמצא ב-GitHub או שהוא פרטי. יש לוודא שהריפו ציבורי ושם המשתמש ב-GitHub בפרופיל נכון, ולהגיש שוב.'
              );
            }
            throw err;
          });
        } else if (submission.fileUrl && fileRef.endsWith('.zip')) {
          code = extractZipCode(await downloadFile(toDeliveryUrl(submission.fileUrl)));
        } else if (submission.fileUrl && fileRef.endsWith('.docx')) {
          code = await extractDocxText(await downloadFile(toDeliveryUrl(submission.fileUrl)));
        } else {
          throw new AiReviewInputError(
            'Unsupported submission type for AI review: expected a GitHub URL, a .zip file, or a .docx file',
            'בדיקת AI אפשרית רק להגשה מ-GitHub, לקובץ ZIP או לקובץ Word (docx).'
          );
        }

        // Without this Gemini gets an empty prompt and grades nothing.
        if (!code.trim()) {
          throw new AiReviewInputError(
            'No reviewable content found in the submission',
            'לא נמצא בהגשה קוד לבדיקה (למשל קבצי js, ts, py, html, css, java). יש לוודא שהקבצים נמצאים בהגשה.'
          );
        }

        const result = await reviewCode(
          code,
          submission.assignment.title,
          submission.assignment.aiInstructions,
          submission.assignment.description
        );

        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            aiStatus: 'done',
            aiScore: result.score,
            aiCodeReview: result.codeReview,
            aiVerbalReview: result.verbalReview,
            aiError: null,
            ...(byTeacher ? {} : { aiReviewCount: { increment: 1 } }),
          },
        });
      } catch (err) {
        // Only give up once BullMQ has exhausted its retries; a transient failure
        // should not burn the student's single review attempt.
        const isFinalAttempt =
          err instanceof AiReviewInputError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        // The submission id is what a developer needs to match a student's report to this line.
        console.error(
          `[ai-review] submission ${submissionId} attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1} failed:`,
          (err as Error)?.message ?? err
        );
        if (isFinalAttempt) {
          await prisma.submission
            .update({ where: { id: submissionId }, data: { aiStatus: 'error', aiError: aiReviewClientMessage(err) } })
            .catch(() => {});
        }
        throw err;
      }
    },
    { connection, ...defaultWorkerOptions }
  );
  attachLifecycleLogging(worker, 'ai-review');
  return worker;
}
