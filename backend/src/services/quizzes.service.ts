import { prisma } from '../config/prisma';
import { assertLessonAccess } from '../utils/access';
import { quizQueue } from '../infrastructure/queues/queues';

export async function getQuiz(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });

  if (!quiz) {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (lesson?.contentMd) {
      // jobId dedups generation: concurrent page loads (or a poll loop) for the
      // same lesson must not each bill a Claude call.
      await quizQueue.add(
        'generate',
        { lessonId, lessonContent: lesson.contentMd },
        { jobId: `quiz:${lessonId}` }
      );
    }
    return { status: 'generating' as const };
  }

  const questions = quiz.questions as any[];
  return {
    status: 'ready' as const,
    quiz: {
      id: quiz.id,
      questions: questions.map((q) => ({
        id: q.id, question: q.question, options: q.options,
        ...(role === 'ADMIN' && { correctIndex: q.correctIndex }),
      })),
    },
  };
}

export async function submitQuizAttempt(
  lessonId: string, studentId: string, role: string, answers: unknown
) {
  // The quiz is resolved from the lesson in the route, never from the body —
  // trusting a body quizId let any student post an attempt for any quiz.
  await assertLessonAccess(studentId, role, lessonId);

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

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

  await prisma.quizAttempt.upsert({
    where: { quizId_studentId: { quizId: quiz.id, studentId } },
    create: { quizId: quiz.id, studentId, answers, score },
    update: { answers, score, takenAt: new Date() },
  });

  return { score, correct, total: questions.length };
}

export async function getQuizResults(lessonId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { lessonId },
    include: {
      attempts: { include: { student: { select: { name: true, email: true } } } },
    },
  });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

  const questions = quiz.questions as any[];
  return {
    quiz: { id: quiz.id, createdAt: quiz.createdAt, questionCount: questions.length },
    results: quiz.attempts.map((a) => ({
      studentName: a.student.name, studentEmail: a.student.email,
      score: a.score, takenAt: a.takenAt,
    })),
  };
}
