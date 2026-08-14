import { prisma } from '../config/prisma';
import { assertLessonAccess } from '../utils/access';
import { quizQueue } from '../infrastructure/queues/queues';

/**
 * Why a quiz cannot be shown, phrased for whoever is asking. A student can only
 * act by telling the teacher; the teacher needs the actual cause, so she gets
 * the technical detail (which never reaches a student).
 */
function unavailableMessage(role: string): string {
  return role === 'ADMIN'
    ? 'לא ניתן ליצור בוחן: לשיעור אין תוכן שיעור. הוסיפי תוכן בעריכת השיעור, והחידון ייווצר אוטומטית.'
    : 'חסרים נתונים ליצירת הבוחן לשיעור זה. פני למורה כדי שתוסיף את תוכן השיעור.';
}

function failedMessage(role: string, reason?: string): string {
  return role === 'ADMIN'
    ? `יצירת הבוחן נכשלה: ${reason || 'שגיאה לא ידועה'}`
    : 'יצירת הבוחן נכשלה. אפשר לנסות שוב, ואם השגיאה חוזרת פני למורה.';
}

export async function getQuiz(lessonId: string, userId: string, role: string) {
  await assertLessonAccess(userId, role, lessonId);

  const quiz = await prisma.quiz.findUnique({ where: { lessonId } });

  if (!quiz) {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw Object.assign(new Error('Lesson not found'), { status: 404 });

    // No source material — say so instead of returning 'generating' for a job
    // that is never enqueued, which left the caller polling a spinner forever.
    if (!lesson.contentMd?.trim()) {
      return { status: 'unavailable' as const, message: unavailableMessage(role) };
    }

    // jobId dedups generation: concurrent page loads (or a poll loop) for the
    // same lesson must not each bill a Gemini call. The flip side is that a
    // finished job keeps its id in Redis (removeOnFail: 7 days), so a failed
    // generation would swallow every retry for a week — hence the explicit
    // removal below before re-adding.
    //
    // The separator is a dash, not a colon: BullMQ rejects any custom job id
    // containing ':' unless it has exactly three colon-separated parts. With
    // `quiz:<lessonId>` every add() threw, so no quiz was ever queued.
    const jobId = `quiz-${lessonId}`;

    try {
      const existing = await quizQueue.getJob(jobId);

      if (existing) {
        const state = await existing.getState();

        if (state === 'failed') {
          const reason = existing.failedReason;
          // Clear the id so the *next* request starts a fresh attempt — that is
          // what the "try again" button does.
          await existing.remove().catch(() => {});
          return { status: 'failed' as const, message: failedMessage(role, reason) };
        }

        // 'completed' with no quiz row means the job finished but the write was
        // lost; anything else is still in flight. Only the former needs a retry.
        if (state !== 'completed') {
          return { status: 'generating' as const };
        }
        await existing.remove().catch(() => {});
      }

      await quizQueue.add(
        'generate',
        { lessonId, lessonContent: lesson.contentMd },
        { jobId }
      );
    } catch (err: any) {
      // A queue-level fault (Redis down, a rejected job id) must surface as a
      // reported failure. Letting it escape as a 500 is what disguised this bug
      // as an endless spinner.
      console.error('[quiz] could not enqueue generation for lesson', lessonId, err);
      return { status: 'failed' as const, message: failedMessage(role, err?.message) };
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
