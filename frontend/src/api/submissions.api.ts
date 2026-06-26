import api from './axios';

export const submissionsApi = {
  submitFile: (assignmentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/assignments/${assignmentId}/submit`, form);
  },

  submitGithub: (assignmentId: string, githubUrl: string) =>
    api.post(`/assignments/${assignmentId}/submit`, { githubUrl }),

  mine: () =>
    api.get('/submissions/mine'),

  get: (id: string) =>
    api.get(`/submissions/${id}`),
};
