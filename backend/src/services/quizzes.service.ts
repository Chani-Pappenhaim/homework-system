import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { assertLessonAccess } from './access.service';
import { NOT_PUBLISHED_MESSAGE, validateQuestions } from './quiz-questions';
import { quizQueue } from '../infrastructure/queues/queues';
import { assertAiAvailable } from './ai-availability';
import { quizExcludedFiles } from '../utils/code-extraction';
import type {
  QuizJobProgress, QuizFailureKind, QuizGenerationStage, QuizSourceFiles,
} from '../infrastructure/queues/job-types';

/** Quizzes are generated, reviewed and published by the teacher; students see a quiz only once it is published. */

/** BullMQ rejects a custom job id containing ':' unless it has exactly 3 parts. */
const jobIdFor = (lessonId: string) => `quiz-${lessonId}`;

function noContentMessage(role: string): string {
  return role === 'ADMIN'
    ? 'לא ניתן ליצור בוחן: לשיעור אין תוכן שיעור. הוסיפי תוכן בעריכת השיעור ואז אפשר יהיה ליצור בוחן.'
    : 'חסרים נתונים ליצירת הבוחן לשיעור זה. פני למורה כדי שתוסיף את תוכן השיעור.';
}

// Generic failure message; the real reason stays in the server log, never the client.
function failedMessage(role: string): string {
  return role === 'ADMIN'
    ? 'יצירת הבוחן נכשלה. נסי שוב מאוחר יותר; אם זה נמשך, פני לתמיכה הטכנית.'
    : 'יצירת הבוחן נכשלה. פני למורה.';
}

/**
 * Why generation failed, in words that tell the teacher what to do next. Each
 * maps a QuizFailureKind recorded by the worker; the provider's raw error stays
 * in the server log.
 */
const TEACHER_FAILURE_MESSAGES: Record<Exclude<QuizFailureKind, 'no-content' | 'unknown'>, string> = {
  timeout: 'ה-AI לא הספיק לענות בזמן, גם אחרי כמה ניסיונות. נסי שוב בעוד כמה דקות; אם צירפת קבצים גדולים, אפשר לנסות גם בלעדיהם.',
  'rate-limit': 'הגענו כרגע למכסת השימוש ב-AI. נסי שוב בעוד כמה דקות.',
  'daily-quota': 'המכסה היומית החינמית של ה-AI נגמרה, והמעבר לגרסה בתשלום אינו זמין (מפתח בתשלום לא מוגדר, או שהמעבר כבוי בהגדרות ה-AI). המכסה מתאפסת כל יום בסביבות 10:00 בבוקר (חצות בשעון קליפורניה) - נסי שוב אחרי כן.',
  unavailable: 'שירות ה-AI לא זמין כרגע. נסי שוב בעוד כמה דקות.',
  config: 'שירות ה-AI לא מוגדר כראוי בשרת, ולכן ניסיון נוסף לא יעזור. פני לתמיכה הטכנית.',
  blocked: 'מסנן התוכן של ה-AI סירב לעבד את תוכן השיעור. נסי לנסח מחדש קטעים רגישים, או ליצור בלי הקבצים המצורפים.',
  'bad-output': 'ה-AI החזיר תשובה לא תקינה. נסי שוב.',
  stuck: 'יצירת הבוחן נעצרה באמצע (כנראה השרת הופעל מחדש). נסי שוב.',
};

function failureMessage(kind: QuizFailureKind | undefined, role: string): string {
  if (kind === 'no-content') return noContentMessage(role);
  if (role !== 'ADMIN' || !kind || kind === 'unknown') return failedMessage(role);
  return TEACHER_FAILURE_MESSAGES[kind];
}

/**
 * How long a generation may go without reporting a new stage before it counts
 * as stuck. The slowest real stages give up on their own after a minute (one
 * Gemini call, reading the files), so five minutes of silence means nobody is
 * working on the job: the server restarted under it, or no worker is running.
 */
const STUCK_AFTER_MS = 5 * 60 * 1000;

/** Where a running generation stands, as the teacher's page shows it. */
export interface QuizGenerationProgress {
  stage: QuizGenerationStage;
  attempt: number;
  maxAttempts: number;
  /** The teacher asked for the lesson files — her page then shows the reading stage. */
  withFiles: boolean;
  /** Since she clicked, not since the current attempt began. */
  elapsedSeconds: number;
  lastFailure?: QuizFailureKind;
}

type GenerationState =
  | { status: 'generating'; progress: QuizGenerationProgress }
  | { status: 'failed'; message: string }
  /** Finished successfully — the quiz row is the answer, and may be newer than one read before. */
  | { status: 'done' }
  | null;

/** Reads the generation job for a lesson. null means there is none. */
async function readGenerationState(lessonId: string, role: string): Promise<GenerationState> {
  const job = await quizQueue.getJob(jobIdFor(lessonId));
  if (!job) return null;
  const progress: Partial<QuizJobProgress> = typeof job.progress === 'object' ? job.progress as Partial<QuizJobProgress> : {};

  // Polled every 5s while generating, so use `finishedOn` here and call the costlier getState() only once the job has finished.
  if (!job.finishedOn) {
    const now = Date.now();
    const lastSign = Math.max(progress.at ?? 0, job.processedOn ?? 0, job.timestamp);
    if (now - lastSign > STUCK_AFTER_MS) {
      // remove() refuses a job whose lock a live worker still holds — that one
      // is only slow, and keeps showing as in progress.
      const removed = await job.remove().then(() => true, () => false);
      if (removed) {
        console.error(
          `[quiz] lesson ${lessonId}: no progress for ${Math.round((now - lastSign) / 1000)}s ` +
            `(stage ${progress.stage ?? 'queued'}) - removed as stuck`
        );
        return { status: 'failed', message: failureMessage('stuck', role) };
      }
    }
    const maxAttempts = job.opts.attempts ?? 1;
    return {
      status: 'generating',
      progress: {
        // No worker has picked it up yet.
        stage: job.processedOn ? (progress.stage ?? 'generating') : 'queued',
        attempt: Math.min(job.attemptsMade + 1, maxAttempts),
        maxAttempts,
        withFiles: Boolean(job.data?.includeFiles),
        elapsedSeconds: Math.round((now - job.timestamp) / 1000),
        ...(progress.lastFailure && { lastFailure: progress.lastFailure }),
      },
    };
  }

  const state = await job.getState();
  // Clear the id either way so the next generate request starts a fresh job.
  await job.remove().catch(() => {});
  // The provider's raw error is logged by attachLifecycleLogging; only the failure kind is needed here.
  if (state === 'failed') return { status: 'failed', message: failureMessage(progress.lastFailure, role) };
  return { status: 'done' };
}

/** Lesson files a generation with "include files" would leave out. */
async function excludedFilesOf(lessonId: string): Promise<string[]> {
  const files = await prisma.lessonFile.findMany({
    where: { lessonId },
    select: { name: true },
    orderBy: { uploadedAt: 'asc' },
  });
  return quizExcludedFiles(files.map((f) => f.name));
}

function toJson(questions: unknown) {
  return questions as unknown as Prisma.InputJsonValue;
}

async function lessonOr404(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new AppError('Lesson not found', 'השיעור לא נמצא', 404);
  return lesson;
}

/**
 * Reads the quiz for a lesson.
 *
 * The teacher sees the draft, the correct answers, the generation state and
 * which lesson files the AI did or would leave out. A student sees a quiz only
 * once it is published, and never sees correctIndex, a failure reason or the
 * fact that a draft exists.
 */
export async function getQuiz(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);
  return readQuiz(lessonId, role);
}

/**
 * The quiz row is read before the generation job. A job that finished between
 * the two reads saved questions the first read did not see — the page would
 * show "create a quiz" over a quiz that exists, or the old questions of a
 * draft with nothing left to poll for. So a finished job means one more read;
 * `settled` stops it there (the job is removed by then, or failed to be).
 */
async function readQuiz(lessonId: string, role: string, settled = false): Promise<any> {
  const isTeacher = role === 'ADMIN';

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });

  if (quiz && (isTeacher || quiz.published)) {
    const questions = quiz.questions as any[];
    const attemptCount = isTeacher ? await prisma.quizAttempt.count({ where: { quizId: quiz.id } }) : 0;
    const ready = {
      status: 'ready' as const,
      quiz: {
        id: quiz.id,
        published: quiz.published,
        questionCount: questions.length,
        questions: questions.map((q) => ({
          id: q.id,
          question: q.question,
          options: q.options,
          ...(isTeacher && { correctIndex: q.correctIndex }),
        })),
        ...(isTeacher && { sourceFiles: (quiz.sourceFiles as QuizSourceFiles | null) ?? null, attemptCount }),
      },
    };
    if (!isTeacher || quiz.published) return ready;

    // A draft can be regenerated; the old questions stay on her page meanwhile,
    // next to the progress of the new ones.
    const [regeneration, excludedFiles] = await Promise.all([
      readGenerationState(lessonId, role).catch((err) => {
        console.error('[quiz] could not read regeneration state for lesson', lessonId, err);
        return null;
      }),
      excludedFilesOf(lessonId),
    ]);
    if (regeneration?.status === 'done') {
      return settled ? { ...ready, regeneration: null, excludedFiles } : readQuiz(lessonId, role, true);
    }
    return { ...ready, regeneration, excludedFiles };
  }

  // Past this point there is nothing the student may take: either no quiz at
  // all, or a draft. Both look identical to her, so a draft stays invisible.
  if (!isTeacher) {
    return { status: 'unavailable' as const, message: NOT_PUBLISHED_MESSAGE };
  }

  const lesson = await lessonOr404(lessonId);
  if (!lesson.contentMd?.trim()) {
    return { status: 'unavailable' as const, message: noContentMessage(role) };
  }

  // No quiz yet — report where generation stands so the teacher's page can show
  // its progress, an error, or the "create quiz" button.
  const excludedFiles = await excludedFilesOf(lessonId);
  try {
    const generation = await readGenerationState(lessonId, role);
    if (generation?.status === 'done') {
      if (!settled) return readQuiz(lessonId, role, true);
    } else if (generation) {
      return { ...generation, excludedFiles };
    }
  } catch (err: any) {
    console.error('[quiz] could not read generation state for lesson', lessonId, err);
    return { status: 'failed' as const, message: failedMessage(role), excludedFiles };
  }

  return { status: 'none' as const, excludedFiles };
}

/**
 * Teacher-only: queue an AI generation for this lesson.
 *
 * With `replace`, regenerates a draft: allowed only while it is unpublished,
 * since students may already be sitting a published quiz. Without it, refuses
 * when a quiz exists — replacing one silently would discard questions she may
 * have edited.
 */
export async function requestQuizGeneration(
  lessonId: string, role: string, includeFiles: boolean, replace = false
) {
  const existing = await prisma.quiz.findUnique({ where: { lessonId } });
  if (existing && !replace) {
    throw new AppError('Quiz already exists for this lesson', 'כבר קיים בוחן לשיעור זה', 409);
  }
  if (existing?.published) {
    throw new AppError(
      'Cannot regenerate a published quiz',
      'אי אפשר ליצור מחדש בוחן שכבר פורסם לתלמידות. כדי ליצור אותו מחדש, החזירי אותו קודם לטיוטה.',
      409
    );
  }

  const lesson = await lessonOr404(lessonId);
  if (!lesson.contentMd?.trim()) {
    throw new AppError('Lesson has no content to generate a quiz from', noContentMessage(role), 409);
  }
  await assertAiAvailable();

  // Files are opt-in (checkbox, default off) because feeding them to Gemini
  // can meaningfully raise the cost of a single generation — the markdown
  // description alone stays the default. They are read by the worker, not
  // here, so this request returns at once however slow the downloads are.
  const jobId = jobIdFor(lessonId);
  try {
    // jobId dedups generation: a double click must not bill two Gemini calls.
    const job = await quizQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return { status: 'generating' as const };
      }
      // A finished job keeps its id in Redis (removeOnFail: 7 days) and would
      // swallow every retry for a week; drop it before re-adding.
      await job.remove().catch(() => {});
    }

    await quizQueue.add('generate', { lessonId, includeFiles, replace: Boolean(existing) }, { jobId });
  } catch (err: any) {
    console.error('[quiz] could not enqueue generation for lesson', lessonId, err);
    throw new AppError('Failed to enqueue quiz generation', failedMessage(role), 502);
  }

  return { status: 'generating' as const };
}

/**
 * Teacher-only: replace the quiz's questions with her edited version.
 *
 * Editing invalidates every attempt already recorded — a stored score refers to
 * questions that no longer exist — so the attempts are cleared with it. That is
 * also why publishing is a separate, deliberate step.
 */
/**
 * A quiz the teacher writes herself, without the AI - so it needs no lesson
 * content and costs nothing. It starts as a draft, like a generated one.
 */
export async function createManualQuiz(lessonId: string, questions: unknown) {
  await lessonOr404(lessonId);
  const validated = validateQuestions(questions);
  try {
    const quiz = await prisma.quiz.create({
      data: { lessonId, questions: toJson(validated), published: false, sourceFiles: Prisma.DbNull },
    });
    return { quiz: { id: quiz.id, published: quiz.published, questionCount: validated.length, questions: validated } };
  } catch (err) {
    // One quiz per lesson: an existing one (or one the AI just finished) is edited, not replaced.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('Quiz already exists for this lesson', 'כבר קיים בוחן לשיעור זה - אפשר לערוך אותו', 409);
    }
    throw err;
  }
}

export async function updateQuizQuestions(lessonId: string, questions: unknown) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new AppError('Quiz not found', 'החידון לא נמצא', 404);

  const validated = validateQuestions(questions);

  const [, updated] = await prisma.$transaction([
    prisma.quizAttempt.deleteMany({ where: { quizId: quiz.id } }),
    prisma.quiz.update({ where: { id: quiz.id }, data: { questions: toJson(validated) } }),
  ]);

  return {
    quiz: {
      id: updated.id,
      published: updated.published,
      questionCount: validated.length,
      questions: validated,
    },
  };
}

/** Teacher-only: remove the lesson's quiz together with every recorded attempt. */
export async function deleteQuiz(lessonId: string) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new AppError('Quiz not found', 'החידון לא נמצא', 404);
  await prisma.$transaction([
    prisma.quizAttempt.deleteMany({ where: { quizId: quiz.id } }),
    prisma.quiz.delete({ where: { id: quiz.id } }),
  ]);
}

/** Teacher-only: show the quiz to students, or pull it back to a draft. */
export async function setQuizPublished(lessonId: string, published: boolean) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new AppError('Quiz not found', 'החידון לא נמצא', 404);

  const questions = quiz.questions as any[];
  if (published) {
    // Publishing an empty or malformed quiz would hand students a broken page.
    validateQuestions(questions);
  }

  const updated = await prisma.quiz.update({ where: { id: quiz.id }, data: { published } });
  return { published: updated.published };
}

// Re-exported so callers keep one entry point.
export { validateQuestions };
export * from './quiz-attempts.service';
