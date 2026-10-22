import { prisma } from '../config/prisma';
import { AppError } from '../utils/errors';
import { assertLessonAccess } from './access.service';
import { NOT_PUBLISHED_MESSAGE, validateQuestions } from './quiz-questions';

export async function submitQuizAttempt(
  lessonId: string, studentId: string, role: string, answers: unknown
) {
  // The quiz is resolved from the lesson in the route, never from a client-supplied
  // id, so a student can only ever submit an attempt for the quiz they were shown.
  await assertLessonAccess(studentId, role, lessonId);

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw new AppError('Quiz not found', 'החידון לא נמצא', 404);

  // A draft is invisible in GET; it must be unanswerable here too, or a student
  // holding an old page could submit against questions still being edited.
  if (!quiz.published) {
    throw new AppError('Quiz not published', NOT_PUBLISHED_MESSAGE, 409);
  }

  const questions = quiz.questions as any[];
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new AppError('Quiz has no questions', 'לחידון הזה אין שאלות עדיין', 409);
  }
  if (!Array.isArray(answers) || answers.length !== questions.length
      || answers.some((a) => !Number.isInteger(a))) {
    throw new AppError('Answers must be one integer per question', 'יש לענות על כל שאלות החידון', 400);
  }

  const correct = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const score = (correct / questions.length) * 100;

  // The first attempt is the official grade and is never touched again; every
  // attempt after it is a fresh row, kept only for the student's own practice
  // history, so retrying can never change what the teacher sees as her score.
  //
  // Two submits at once (a double click, two tabs) would both see "no official
  // attempt yet" and both be stored as official. A transaction-scoped advisory
  // lock on this student+quiz makes the check-then-insert run one at a time.
  const isOfficial = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quiz-attempt:${quiz.id}:${studentId}`}))`;
    const hasOfficial = await tx.quizAttempt.findFirst({
      where: { quizId: quiz.id, studentId, isOfficial: true },
      select: { id: true },
    });
    await tx.quizAttempt.create({
      data: { quizId: quiz.id, studentId, answers, score, isOfficial: !hasOfficial },
    });
    return !hasOfficial;
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
  // No quiz yet is a normal state for a lesson, not an error — a 404 here showed
  // up as a red console error on every teacher lesson page without a quiz.
  if (!quiz) return null;

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
