import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { assertLessonAccess } from '../utils/access';
import { quizQueue } from '../infrastructure/queues/queues';
import { extractLessonFilesText } from '../utils/code-extraction';

/**
 * A quiz belongs to the teacher, not to whoever opened the page first.
 *
 * She generates it, reviews the AI's questions, edits what she wants and
 * publishes. Until she publishes, students are told the quiz is not ready —
 * they can neither see it nor sit it. Generation is never triggered by a
 * student request, so no student waits on (or bills) an AI call.
 */

/** BullMQ rejects a custom job id containing ':' unless it has exactly 3 parts. */
const jobIdFor = (lessonId: string) => `quiz-${lessonId}`;

function noContentMessage(role: string): string {
  return role === 'ADMIN'
    ? 'לא ניתן ליצור בוחן: לשיעור אין תוכן שיעור. הוסיפי תוכן בעריכת השיעור ואז אפשר יהיה ליצור בוחן.'
    : 'חסרים נתונים ליצירת הבוחן לשיעור זה. פני למורה כדי שתוסיף את תוכן השיעור.';
}

// The real reason (provider errors, stack traces) is a developer-facing detail —
// it goes to the server console (see worker-events.ts / the catch block below),
// never to the client. Both roles get the same generic, actionable message.
function failedMessage(role: string): string {
  return role === 'ADMIN'
    ? 'יצירת הבוחן נכשלה. נסי שוב מאוחר יותר; אם זה נמשך, פני לתמיכה הטכנית.'
    : 'יצירת הבוחן נכשלה. פני למורה.';
}

/** What a student is told whenever there is no quiz she may take. */
const NOT_PUBLISHED_MESSAGE = 'החידון לשיעור הזה עדיין לא פורסם. המורה מכינה אותו — נסי שוב מאוחר יותר.';

export interface QuizQuestionInput {
  id?: unknown;
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
}

/**
 * Validates teacher-edited questions before they can replace a stored quiz.
 *
 * Scoring trusts `correctIndex` to point at a real option, and the student page
 * renders one radio per option — a malformed question saved here would only
 * fail later, in the middle of somebody's quiz.
 */
export function validateQuestions(input: unknown): { id: string; question: string; options: string[]; correctIndex: number }[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw Object.assign(new Error('הבוחן חייב לכלול לפחות שאלה אחת'), { status: 400 });
  }

  return input.map((q: QuizQuestionInput, i: number) => {
    const question = typeof q?.question === 'string' ? q.question.trim() : '';
    if (!question) {
      throw Object.assign(new Error(`שאלה ${i + 1}: חסר טקסט השאלה`), { status: 400 });
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw Object.assign(new Error(`שאלה ${i + 1}: נדרשות לפחות שתי אפשרויות`), { status: 400 });
    }
    const options = q.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    if (options.some((o) => !o)) {
      throw Object.assign(new Error(`שאלה ${i + 1}: כל האפשרויות חייבות להכיל טקסט`), { status: 400 });
    }

    if (!Number.isInteger(q.correctIndex) || (q.correctIndex as number) < 0 || (q.correctIndex as number) >= options.length) {
      throw Object.assign(new Error(`שאלה ${i + 1}: יש לסמן תשובה נכונה`), { status: 400 });
    }

    // ids double as React keys, so they must be unique whatever came in.
    return { id: String(q.id ?? i + 1), question, options, correctIndex: q.correctIndex as number };
  });
}

function toJson(questions: unknown) {
  return questions as unknown as Prisma.InputJsonValue;
}

async function lessonOr404(lessonId: string) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw Object.assign(new Error('Lesson not found'), { status: 404 });
  return lesson;
}

/**
 * Reads the quiz for a lesson.
 *
 * The teacher sees the draft, the correct answers and the generation state.
 * A student sees a quiz only once it is published, and never sees correctIndex,
 * a failure reason or the fact that a draft exists.
 */
export async function getQuiz(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);
  const isTeacher = role === 'ADMIN';

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });

  if (quiz && (isTeacher || quiz.published)) {
    const questions = quiz.questions as any[];
    return {
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
      },
    };
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
  // a spinner, an error, or the "create quiz" button.
  try {
    const job = await quizQueue.getJob(jobIdFor(lessonId));
    if (job) {
      // While the AI is working, this runs every 5 seconds from her open page —
      // it is the most repeated Redis read in the app. getState() has to probe
      // one key per possible state to answer, whereas `finishedOn` already came
      // back with the job in the single read above and is set only once the job
      // reaches a terminal state. So the polling case costs one command, and
      // the expensive question is asked once, at the end.
      if (!job.finishedOn) return { status: 'generating' as const };

      const state = await job.getState();
      if (state === 'failed') {
        // job.failedReason (the provider's raw error) already reached the server
        // console via attachLifecycleLogging's 'failed' listener — no need to log it
        // again here, and it must never reach the client (see failedMessage above).
        // Clear the id so the next generate request starts a fresh attempt.
        await job.remove().catch(() => {});
        return { status: 'failed' as const, message: failedMessage(role) };
      }
      if (state !== 'completed') return { status: 'generating' as const };
      await job.remove().catch(() => {});
    }
  } catch (err: any) {
    console.error('[quiz] could not read generation state for lesson', lessonId, err);
    return { status: 'failed' as const, message: failedMessage(role) };
  }

  return { status: 'none' as const };
}

/**
 * Teacher-only: queue an AI generation for this lesson.
 *
 * Refuses when a quiz already exists — replacing one silently would discard
 * questions she may have edited, along with every attempt already made on it.
 */
export async function requestQuizGeneration(lessonId: string, role: string, includeFiles: boolean) {
  const existing = await prisma.quiz.findUnique({ where: { lessonId } });
  if (existing) {
    throw Object.assign(new Error('כבר קיים בוחן לשיעור זה'), { status: 409 });
  }

  const lesson = await lessonOr404(lessonId);
  if (!lesson.contentMd?.trim()) {
    throw Object.assign(new Error(noContentMessage(role)), { status: 409 });
  }

  // Files are opt-in (checkbox, default off) because feeding them to Gemini
  // can meaningfully raise the cost of a single generation — the markdown
  // description alone stays the default.
  let lessonContent = lesson.contentMd;
  if (includeFiles) {
    const files = await prisma.lessonFile.findMany({ where: { lessonId } });
    if (files.length > 0) {
      const filesText = await extractLessonFilesText(files);
      if (filesText) {
        lessonContent = `${lessonContent}\n\n--- קבצים מצורפים לשיעור ---\n${filesText}`;
      }
    }
  }

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

    await quizQueue.add('generate', { lessonId, lessonContent }, { jobId });
  } catch (err: any) {
    console.error('[quiz] could not enqueue generation for lesson', lessonId, err);
    throw Object.assign(new Error(failedMessage(role)), { status: 502 });
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
export async function updateQuizQuestions(lessonId: string, questions: unknown) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

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

/** Teacher-only: show the quiz to students, or pull it back to a draft. */
export async function setQuizPublished(lessonId: string, published: boolean) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

  const questions = quiz.questions as any[];
  if (published) {
    // Publishing an empty or malformed quiz would hand students a broken page.
    validateQuestions(questions);
  }

  const updated = await prisma.quiz.update({ where: { id: quiz.id }, data: { published } });
  return { published: updated.published };
}

export async function submitQuizAttempt(
  lessonId: string, studentId: string, role: string, answers: unknown
) {
  // The quiz is resolved from the lesson in the route, never from a client-supplied
  // id, so a student can only ever submit an attempt for the quiz they were shown.
  await assertLessonAccess(studentId, role, lessonId);

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

  // A draft is invisible in GET; it must be unanswerable here too, or a student
  // holding an old page could submit against questions still being edited.
  if (!quiz.published) {
    throw Object.assign(new Error(NOT_PUBLISHED_MESSAGE), { status: 409 });
  }

  const questions = quiz.questions as any[];
  if (!Array.isArray(questions) || questions.length === 0) {
    throw Object.assign(new Error('Quiz has no questions'), { status: 409 });
  }
  if (!Array.isArray(answers) || answers.length !== questions.length
      || answers.some((a) => !Number.isInteger(a))) {
    throw Object.assign(new Error('Answers must be one integer per question'), { status: 400 });
  }

  const correct = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const score = (correct / questions.length) * 100;

  // The first attempt is the official grade and is never touched again; every
  // attempt after it is a fresh row, kept only for the student's own practice
  // history, so retrying can never change what the teacher sees as her score.
  const hasOfficial = await prisma.quizAttempt.findFirst({
    where: { quizId: quiz.id, studentId, isOfficial: true },
    select: { id: true },
  });
  const isOfficial = !hasOfficial;
  await prisma.quizAttempt.create({
    data: { quizId: quiz.id, studentId, answers, score, isOfficial },
  });

  return {
    score,
    correct,
    total: questions.length,
    isOfficial,
    // The correct answers ride back with the result, and only here. GET still
    // withholds correctIndex from students — otherwise the quiz would ship its
    // own answer key. Once she has answered there is nothing left to protect,
    // and she needs to see which ones she got wrong and what the answer was.
    review: questions.map((q, i) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      selectedIndex: answers[i],
      isCorrect: answers[i] === q.correctIndex,
    })),
  };
}

/**
 * Everything the teacher's quiz page shows: the quiz, who answered, and — the
 * part she cannot work out from a list of scores — how the class did on each
 * individual question.
 *
 * A per-student score says who is struggling. A per-question breakdown says what
 * the class did not understand, which is what she would change her next lesson
 * over. Both come from the same stored answers, so they are computed together.
 */
export async function getQuizResults(lessonId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId },
    include: {
      // Practice retries are the student's own business — the teacher's stats
      // and per-student score must stay based on the one official attempt.
      attempts: { where: { isOfficial: true }, include: { student: { select: { name: true, email: true } } } },
    },
  });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

  const questions = quiz.questions as any[];
  const attempts = quiz.attempts;

  const questionStats = questions.map((q, i) => {
    // One count per option, plus a tally of attempts that skipped the question.
    const optionCounts: number[] = (q.options as string[]).map(() => 0);
    let unanswered = 0;

    for (const attempt of attempts) {
      const picked = (attempt.answers as any[])?.[i];
      if (Number.isInteger(picked) && picked >= 0 && picked < optionCounts.length) {
        optionCounts[picked]! += 1;
      } else {
        unanswered += 1;
      }
    }

    const correctCount = optionCounts[q.correctIndex] ?? 0;
    return {
      id: q.id,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      optionCounts,
      unanswered,
      correctCount,
      // Percentages are meaningless with no attempts; the page shows "no data"
      // rather than a 0% that reads like everybody failed.
      correctRate: attempts.length > 0 ? (correctCount / attempts.length) * 100 : null,
    };
  });
  const averageScore = attempts.length > 0
    ? attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length
    : null;

  return {
    quiz: {
      id: quiz.id,
      createdAt: quiz.createdAt,
      published: quiz.published,
      questionCount: questions.length,
    },
    summary: {
      attemptCount: attempts.length,
      averageScore,
    },
    questions: questionStats,
    results: attempts.map((a) => ({
      studentName: a.student.name, studentEmail: a.student.email,
      score: a.score, takenAt: a.takenAt,
    })),
  };
}

/**
 * A student's own attempt history for this quiz — the official (first, graded)
 * attempt plus every practice retry after it, oldest first.
 */
export async function getMyQuizAttempts(lessonId: string, studentId: string, role: string) {
  await assertLessonAccess(studentId, role, lessonId);

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) return { attempts: [] };

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: quiz.id, studentId },
    orderBy: { takenAt: 'asc' },
  });

  return {
    attempts: attempts.map((a, i) => ({
      attemptNumber: i + 1,
      score: a.score,
      takenAt: a.takenAt,
      isOfficial: a.isOfficial,
    })),
  };
}
