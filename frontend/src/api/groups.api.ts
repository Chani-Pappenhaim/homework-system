import api from './axios';
import type { GroupDTO, GroupDetailDTO } from '@/types';

export const groupsApi = {
  list: () =>
    api.get<{ success: true; data: { groups: GroupDTO[] } }>('/groups'),

  get: (id: string) =>
    api.get<{ success: true; data: { group: GroupDetailDTO } }>(`/groups/${id}`),

  create: (data: { name: string; seminar?: string; year: string }) =>
    api.post<{ success: true; data: { group: GroupDTO } }>('/groups', data),

  update: (id: string, data: Partial<{ name: string; seminar: string; year: string }>) =>
    api.put<{ success: true; data: { group: GroupDTO } }>(`/groups/${id}`, data),

  delete: (id: string) =>
    api.delete(`/groups/${id}`),

  addStudent: (groupId: string, data: { name: string; email: string; githubUsername?: string }) =>
    api.post(`/groups/${groupId}/students`, data),

  removeStudent: (groupId: string, studentId: string) =>
    api.delete(`/groups/${groupId}/students/${studentId}`),

  removeStudents: (groupId: string, studentIds: string[]) =>
    api.post<{ success: true; data: { removed: number } }>(`/groups/${groupId}/students/remove-bulk`, { studentIds }),

  updateStudent: (groupId: string, studentId: string, data: Partial<{ name: string; email: string; githubUsername: string }>) =>
    api.put(`/groups/${groupId}/students/${studentId}`, data),

  importStudents: (groupId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/groups/${groupId}/import`, form);
  },

  downloadImportTemplate: () =>
    api.get('/groups/import-template', { responseType: 'blob' }),

  resetPassword: (groupId: string, studentId: string) =>
    api.post(`/groups/${groupId}/reset-password/${studentId}`),
};
