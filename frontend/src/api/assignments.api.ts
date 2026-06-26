import api from './axios';
import type { AssignmentDTO } from '@/types';

export const assignmentsApi = {
  list: (lessonId: string) =>
    api.get<{ success: true; data: { assignments: AssignmentDTO[] } }>(`/lessons/${lessonId}/assignments`),

  create: (lessonId: string, data: Partial<AssignmentDTO> & { title: string }) =>
    api.post(`/lessons/${lessonId}/assignments`, data),

  update: (id: string, data: Partial<AssignmentDTO>) =>
    api.put(`/assignments/${id}`, data),

  delete: (id: string) =>
    api.delete(`/assignments/${id}`),

  getSubmissions: (id: string) =>
    api.get(`/assignments/${id}/submissions`),

  importFromExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/assignments/import', form);
  },
};
