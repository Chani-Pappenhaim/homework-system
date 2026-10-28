import { Worker, UnrecoverableError } from 'bullmq';
import type IORedis from 'ioredis';
import { prisma } from '../config/prisma';
import { reviewCode, GeminiError, type ReviewReferences } from '../services/gemini.service';
import {
  fetchGithubCode, extractZipCode, extractDocxText, extractLessonFiles, DEFAULT_REVIEW_LIMITS, LARGE_REVIEW_LIMITS,
} from '../utils/code-extraction';
import { toDeliveryUrl } from '../utils/storage';
import type { AiReviewJobData } from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';
import { AiReviewInputError, aiReviewClientMessage } from './ai-review-errors';
import { defaultWorkerOptions } from './worker-defaults';

async function downloadFile(fileUrl: string): Promise<Buffer> {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Failed to download submission file: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The lesson files the teacher picked for this assignment's review, read for Gemini; none picked, none read. */
async function readReferences(
  submissionId: string,
  files: { name: string; url: string; sizeBytes: bigint | null }[]
): Promise<ReviewReferences | undefined> {
  if (files.length === 0) return undefined;
  const extracted = await extractLessonFiles(files);
  console.log(
    `[ai-review] submission ${submissionId}: read ${extracted.used.length}/${files.length} reference files` +
      (extracted.skipped.length
        ? `, skipped ${extracted.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`
        : '')
  );
  return { text: extracted.text, attachments: extracted.inline };
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
          include: {
            assignment: { include: { aiReferenceFiles: { orderBy: { uploadedAt: 'asc' } } } },
            student: true,
          },
        });
        if (!submission) throw new Error('Submission not found');
        // The teacher may turn AI review off while a review is still queued.
        if (submission.assignment?.aiReviewEnabled === false) {
          throw new AiReviewInputError(
            'AI review is disabled for this assignment',
            'המורה ביטלה את בדיקת ה-AI במטלה זו.'
          );
        }

        const fileRef = (submission.fileName || submission.fileUrl || '').toLowerCase();
        const limits = submission.assignment.aiReviewLarge ? LARGE_REVIEW_LIMITS : DEFAULT_REVIEW_LIMITS;

        let code = '';
        if (submission.githubUrl) {
          code = await fetchGithubCode(submission.githubUrl, limits).catch((err) => {
            if (err?.status === 404) {
              throw new AiReviewInputError(
                err.message,
                'הריפו לא נמצא ב-GitHub או שהוא פרטי. יש לוודא שהריפו ציבורי ושם המשתמש ב-GitHub בפרופיל נכון, ולהגיש שוב.'
              );
            }
            throw err;
          });
        } else if (submission.fileUrl && fileRef.endsWith('.zip')) {
          code = await extractZipCode(await downloadFile(toDeliveryUrl(submission.fileUrl)), limits);
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
            'לא נמצא בהגשה קוד לבדיקה (למשל קבצי js, ts, py, html, css, java או קובץ Word). יש לוודא שהקבצים נמצאים בהגשה.'
          );
        }

        const { assignment } = submission;
        const references = await readReferences(submissionId, assignment.aiReferenceFiles);
        const review = (refs?: ReviewReferences) =>
          reviewCode(code, assignment.title, assignment.aiInstructions, assignment.description, refs);
        let result;
        try {
          result = await review(references);
        } catch (err) {
          // Google refuses the whole request over one damaged PDF or image (a 400).
          // The submission is still worth reviewing: once more, without the files
          // Gemini was reading itself.
          if (!references?.attachments.length || !(err instanceof GeminiError) || err.status !== 400) throw err;
          console.warn(
            `[ai-review] submission ${submissionId}: Gemini refused the reference files (${err.message}) - retrying without them`
          );
          result = await review({ text: references.text, attachments: [] });
        }

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
        // A wrong key or a blocked prompt fails the same way every time, so it is final too.
        const permanent = err instanceof GeminiError && !err.retryable;
        const isFinalAttempt =
          err instanceof AiReviewInputError || permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
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
        if (permanent) throw new UnrecoverableError(err.message);
        throw err;
      }
    },
    { connection, ...defaultWorkerOptions }
  );
  attachLifecycleLogging(worker, 'ai-review');
  return worker;
}
