import api from './axios';
import type { CourseDTO, CourseDetailDTO } from '@/types';

export const coursesApi = {
  list: () =>
    api.get<{ success: true; data: { courses: CourseDTO[] } }>('/courses'),

  get: (id: string) =>
    api.get<{ success: true; data: { course: CourseDetailDTO } }>(`/courses/${id}`),

  create: (data: { name: string; year?: string; description?: string; groupId: string }) =>
    api.post<{ success: true; data: { course: CourseDTO } }>('/courses', data),

  update: (id: string, data: Partial<{ name: string; year: string; description: string; imageUrl: string; hidden: boolean; groupId: string }>) =>
    api.put<{ success: true; data: { course: CourseDTO } }>(`/courses/${id}`, data),

  delete: (id: string) =>
    api.delete(`/courses/${id}`),

  copy: (id: string, targetGroupId: string) =>
    api.post(`/courses/${id}/copy`, { targetGroupId }),

  grantAccess: (id: string, studentId: string) =>
    api.post(`/courses/${id}/access`, { studentId }),

  revokeAccess: (id: string, studentId: string) =>
    api.delete(`/courses/${id}/access/${studentId}`),

  addLink: (id: string, data: { label: string; url: string; order?: number }) =>
    api.post(`/courses/${id}/links`, data),

  deleteLink: (id: string, linkId: string) =>
    api.delete(`/courses/${id}/links/${linkId}`),

  uploadFile: (id: string, file: File, name?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (name?.trim()) form.append('name', name.trim());
    return api.post(`/courses/${id}/files`, form);
  },

  deleteFile: (id: string, fileId: string) =>
    api.delete(`/courses/${id}/files/${fileId}`),
};
