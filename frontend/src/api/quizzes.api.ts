import api from './axios';
import type { QuizAttemptResult, QuizQuestion, QuizResultsDTO } from '@/types';

export interface QuizStatusDTO {
  status: 'generating' | 'ready';
  quiz?: { questions: QuizQuestion[] };
}

export const quizzesApi = {
  get: (lessonId: string) =>
    api.get<{ success: true; data: QuizStatusDTO }>(`/lessons/${lessonId}/quiz`),

  attempt: (lessonId: string, answers: number[]) =>
    api.post<{ success: true; data: QuizAttemptResult }>(`/lessons/${lessonId}/quiz/attempt`, { answers }),

  results: (lessonId: string) =>
    api.get<{ success: true; data: QuizResultsDTO }>(`/lessons/${lessonId}/quiz/results`),
};
