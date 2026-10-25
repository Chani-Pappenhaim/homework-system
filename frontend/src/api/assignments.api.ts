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

  /** The course's students, each with whether she already submitted - for the teacher to submit for one. */
  students: (id: string) =>
    api.get<{ success: true; data: { students: { id: string; name: string; email: string; submitted: boolean }[] } }>(`/assignments/${id}/students`),

  submitForStudent: (id: string, data: { studentId: string; isLate: boolean; repo?: string; file?: File }) => {
    const form = new FormData();
    form.append('studentId', data.studentId);
    form.append('isLate', String(data.isLate));
    if (data.repo) form.append('repo', data.repo);
    if (data.file) form.append('file', data.file);
    return api.post<{ success: true; data: { submission: { id: string } } }>(`/assignments/${id}/submissions/for-student`, form);
  },

  importFromExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/assignments/import', form);
  },
};
