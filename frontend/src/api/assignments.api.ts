import api from './axios';
import type { AssignmentDTO, SubmissionDTO } from '@/types';

export const assignmentsApi = {
  list: (lessonId: string) =>
    api.get<{ success: true; data: { assignments: AssignmentDTO[] } }>(`/lessons/${lessonId}/assignments`),

  create: (lessonId: string, data: Omit<Partial<AssignmentDTO>, 'deadline'> & { title: string; description: string; deadline?: string | null }) =>
    api.post(`/lessons/${lessonId}/assignments`, data),

  update: (id: string, data: Omit<Partial<AssignmentDTO>, 'deadline'> & { deadline?: string | null }) =>
    api.put(`/assignments/${id}`, data),

  delete: (id: string) =>
    api.delete(`/assignments/${id}`),

  getSubmissions: (id: string) =>
    api.get<{ success: true; data: { submissions: SubmissionDTO[] } }>(`/assignments/${id}/submissions`),

  importFromExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/assignments/import', form);
  },
};
