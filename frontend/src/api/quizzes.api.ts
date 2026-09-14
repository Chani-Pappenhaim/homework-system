import api from './axios';
import type { QuizAttemptResultDTO, QuizQuestionDTO, QuizResultsDTO, QuizStateDTO, QuizAttemptHistoryDTO } from '@/types';

export const quizzesApi = {
  /** Read-only for both roles. A student gets a quiz only once it is published. */
  get: (lessonId: string) =>
    api.get<{ success: true; data: QuizStateDTO }>(`/lessons/${lessonId}/quiz`),

  // --- teacher only -------------------------------------------------------
  /** Queue an AI generation. The only quiz route that can cost money. */
  generate: (lessonId: string) =>
    api.post(`/lessons/${lessonId}/quiz/generate`),

  updateQuestions: (lessonId: string, questions: QuizQuestionDTO[]) =>
    api.put(`/lessons/${lessonId}/quiz`, { questions }),

  setPublished: (lessonId: string, published: boolean) =>
    api.patch(`/lessons/${lessonId}/quiz/publish`, { published }),

  results: (lessonId: string) =>
    api.get<{ success: true; data: QuizResultsDTO }>(`/lessons/${lessonId}/quiz/results`),

  // --- student only -------------------------------------------------------
  attempt: (lessonId: string, answers: number[]) =>
    api.post<{ success: true; data: QuizAttemptResultDTO }>(`/lessons/${lessonId}/quiz/attempt`, { answers }),

  /** The student's own past attempts — official grade plus practice retries. */
  myAttempts: (lessonId: string) =>
    api.get<{ success: true; data: QuizAttemptHistoryDTO }>(`/lessons/${lessonId}/quiz/attempts`),
};
