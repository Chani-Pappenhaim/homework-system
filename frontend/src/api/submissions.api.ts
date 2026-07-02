import api from './axios';

export const submissionsApi = {
  submitFile: (assignmentId: string, file: File, notes?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return api.post(`/assignments/${assignmentId}/submit`, form);
  },

  submitRepo: (assignmentId: string, repoName: string, notes?: string) =>
    api.post(`/assignments/${assignmentId}/submit`, { repoName, notes }),

  mine: () =>
    api.get('/submissions/mine'),

  get: (id: string) =>
    api.get(`/submissions/${id}`),

  importSubmissions: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/submissions/import', form);
  },

  requestAiReview: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/request-ai-review`),

  approveAi: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/approve-ai`),

  allowExtraAi: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/allow-extra-ai`),

  restoreAiScore: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/restore-ai-score`),
};
