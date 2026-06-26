import { prisma } from '../config/prisma';
import { quizQueue } from '../workers';

export async function getQuiz(lessonId: string, role: string) {
  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });

  if (!quiz) {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (lesson?.contentMd) {
      await quizQueue.add('generate', { lessonId, lessonContent: lesson.contentMd });
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

export async function submitQuizAttempt(quizId: string, studentId: string, answers: number[]) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw Object.assign(new Error('Quiz not found'), { status: 404 });

  const questions = quiz.questions as any[];
  const correct = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const score = (correct / questions.length) * 100;

  await prisma.quizAttempt.upsert({
    where: { quizId_studentId: { quizId, studentId } },
    create: { quizId, studentId, answers, score },
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
