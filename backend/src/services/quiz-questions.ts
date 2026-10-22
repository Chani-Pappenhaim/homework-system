import { AppError } from '../utils/errors';

/** What a student is told whenever there is no quiz she may take. */
export const NOT_PUBLISHED_MESSAGE = 'החידון לשיעור הזה עדיין לא פורסם. המורה מכינה אותו - נסי שוב מאוחר יותר.';

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
    throw new AppError('Quiz must have at least one question', 'הבוחן חייב לכלול לפחות שאלה אחת', 400);
  }

  return input.map((q: QuizQuestionInput, i: number) => {
    const question = typeof q?.question === 'string' ? q.question.trim() : '';
    if (!question) {
      throw new AppError(`Question ${i + 1}: missing question text`, `שאלה ${i + 1}: חסר טקסט השאלה`, 400);
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new AppError(`Question ${i + 1}: needs at least two options`, `שאלה ${i + 1}: נדרשות לפחות שתי אפשרויות`, 400);
    }
    const options = q.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    if (options.some((o) => !o)) {
      throw new AppError(`Question ${i + 1}: all options must have text`, `שאלה ${i + 1}: כל האפשרויות חייבות להכיל טקסט`, 400);
    }

    if (!Number.isInteger(q.correctIndex) || (q.correctIndex as number) < 0 || (q.correctIndex as number) >= options.length) {
      throw new AppError(`Question ${i + 1}: must mark a correct answer`, `שאלה ${i + 1}: יש לסמן תשובה נכונה`, 400);
    }

    // ids double as React keys, so they must be unique whatever came in.
    return { id: String(q.id ?? i + 1), question, options, correctIndex: q.correctIndex as number };
  });
}
