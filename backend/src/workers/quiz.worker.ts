import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import type IORedis from 'ioredis';
import { prisma } from '../config/prisma';
import { generateQuiz, GeminiError, type QuizQuestion } from '../services/gemini.service';
import { extractLessonFiles, type InlineAttachment } from '../utils/code-extraction';
import type {
  QuizJobData, QuizJobProgress, QuizGenerationStage, QuizFailureKind, QuizSourceFiles,
} from '../infrastructure/queues/job-types';
import { attachLifecycleLogging } from './worker-events';
import { defaultWorkerOptions } from './worker-defaults';

/** The lesson lost its text between the click and the job — no retry will bring it back. */
class QuizNoContentError extends UnrecoverableError {
  constructor(lessonId: string) {
    super(`Lesson ${lessonId} has no content to generate a quiz from`);
    this.name = 'QuizNoContentError';
  }
}

function failureKindOf(err: unknown): QuizFailureKind {
  if (err instanceof GeminiError) return err.kind;
  if (err instanceof QuizNoContentError) return 'no-content';
  return 'unknown';
}

/**
 * Generates the quiz draft for one lesson.
 *
 * Content is read here, from the database, rather than carried in the job: the
 * teacher's click returns at once, and slow file downloads count against the
 * job (which reports them) instead of an HTTP request (which would just hang).
 *
 * Every stage is written to the job's progress so her page can say what is
 * happening, and so a job that stops reporting can be recognised as stuck.
 */
export async function processQuizJob(job: Job<QuizJobData>): Promise<void> {
  const { lessonId, includeFiles = false, replace = false } = job.data;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 1;

  // A retry starts with the previous attempt's progress; keep its failure kind
  // so the page can say why it is trying again.
  const previous = job.progress as Partial<QuizJobProgress> | number | undefined;
  let lastFailure = typeof previous === 'object' ? previous?.lastFailure : undefined;
  const report = (stage: QuizGenerationStage) =>
    job.updateProgress({ stage, at: Date.now(), ...(lastFailure && { lastFailure }) } satisfies QuizJobProgress);

  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { contentMd: true } });
    if (!lesson?.contentMd?.trim()) throw new QuizNoContentError(lessonId);

    let content = lesson.contentMd;
    let attachments: InlineAttachment[] = [];
    let sourceFiles: QuizSourceFiles | null = null;

    if (includeFiles) {
      const files = await prisma.lessonFile.findMany({ where: { lessonId }, orderBy: { uploadedAt: 'asc' } });
      if (files.length > 0) {
        await report('reading-files');
        const extracted = await extractLessonFiles(files);
        console.log(
          `[quiz] lesson ${lessonId}: read ${extracted.used.length}/${files.length} files` +
            (extracted.skipped.length
              ? `, skipped ${extracted.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`
              : '')
        );
        if (extracted.text) content += `\n\n--- קבצים מצורפים לשיעור ---\n${extracted.text}`;
        attachments = extracted.inline;
        sourceFiles = { included: extracted.used, skipped: extracted.skipped };
      }
    }

    await report('generating');
    let questions: QuizQuestion[];
    try {
      questions = await generateQuiz(content, attachments);
    } catch (err) {
      // Google refuses the whole request over one damaged PDF or image (a 400),
      // which would otherwise read as "AI misconfigured" and never be retried.
      // The lesson text is still worth a quiz: try once more without the files
      // Gemini was reading itself, and tell her they were left out.
      if (attachments.length === 0 || !(err instanceof GeminiError) || err.status !== 400) throw err;
      console.warn(
        `[quiz] lesson ${lessonId}: Gemini refused the attached files (${err.message}) — retrying without them`
      );
      const refused = new Set(attachments.map((a) => a.name));
      sourceFiles = {
        included: sourceFiles!.included.filter((name) => !refused.has(name)),
        skipped: [...sourceFiles!.skipped, ...[...refused].map((name) => ({ name, reason: 'unreadable' }))],
      };
      attachments = [];
      questions = await generateQuiz(content);
    }

    await report('saving');
    const saved = await saveQuiz(lessonId, questions, sourceFiles, replace);
    if (saved) console.log(`[quiz] lesson ${lessonId} generated on attempt ${attempt}/${maxAttempts}`);
  } catch (err: any) {
    const kind = failureKindOf(err);
    lastFailure = kind;

    // The lesson id is what a developer needs to match a teacher's report to this line.
    console.error(`[quiz] lesson ${lessonId} attempt ${attempt}/${maxAttempts} failed (${kind}):`, err?.message ?? err);
    await job
      .updateProgress({ stage: 'retrying', at: Date.now(), lastFailure: kind } satisfies QuizJobProgress)
      .catch(() => {});

    // A wrong key or a blocked prompt fails the same way every time — retrying
    // only makes her wait through two more timeouts for the same answer.
    if (err instanceof GeminiError && !err.retryable) throw new UnrecoverableError(err.message);
    throw err;
  }
}

/**
 * Stores the generated questions as an unpublished draft. Returns false when
 * they were discarded because a quiz the teacher may already rely on is there.
 */
async function saveQuiz(
  lessonId: string,
  questions: QuizQuestion[],
  sourceFiles: QuizSourceFiles | null,
  replace: boolean
): Promise<boolean> {
  // Prisma's Json fields are typed strictly; cast the typed values to InputJsonValue.
  const data = {
    questions: questions as unknown as Prisma.InputJsonValue,
    sourceFiles: sourceFiles ? (sourceFiles as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };

  if (replace) {
    return prisma.$transaction(async (tx) => {
      // The published check and the write are one statement, so a publish that
      // lands while the AI was working always wins: students may already be in it.
      const { count } = await tx.quiz.updateMany({
        where: { lessonId, published: false },
        data: { ...data, createdAt: new Date() },
      });
      if (count === 0) {
        if (await tx.quiz.findUnique({ where: { lessonId }, select: { id: true } })) {
          console.warn(`[quiz] lesson ${lessonId} was published during regeneration — keeping the published quiz`);
          return false;
        }
        await tx.quiz.create({ data: { lessonId, ...data, published: false } });
        return true;
      }
      // Attempts made while an earlier version was published refer to questions
      // that no longer exist — the same rule as when she edits the questions.
      const quiz = await tx.quiz.findUnique({ where: { lessonId }, select: { id: true } });
      await tx.quizAttempt.deleteMany({ where: { quizId: quiz!.id } });
      return true;
    });
  }

  try {
    // Generated questions always land as an unpublished draft until a teacher reviews them.
    await prisma.quiz.create({ data: { lessonId, ...data, published: false } });
    return true;
  } catch (err) {
    // A quiz appeared while this job ran (a stuck job was replaced and both
    // finished). Never overwrite it: it may already be edited or answered.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      console.warn(`[quiz] lesson ${lessonId} already has a quiz — discarding the newly generated one`);
      return false;
    }
    throw err;
  }
}

export function registerQuizWorker(connection: IORedis): Worker<QuizJobData> {
  const worker = new Worker<QuizJobData>('quiz', processQuizJob, { connection, ...defaultWorkerOptions });
  attachLifecycleLogging(worker, 'quiz');
  return worker;
}
