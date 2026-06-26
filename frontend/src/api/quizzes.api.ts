import api from './axios';

export const quizzesApi = {
  get: (lessonId: string) =>
    api.get(`/lessons/${lessonId}/quiz`),

  attempt: (lessonId: string, answers: number[]) =>
    api.post(`/lessons/${lessonId}/quiz/attempt`, { answers }),

  results: (lessonId: string) =>
    api.get(`/lessons/${lessonId}/quiz/results`),
};
