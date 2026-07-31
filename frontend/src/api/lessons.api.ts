import api from './axios';
import type { LessonDetailDTO } from '@/types';

export const lessonsApi = {
  list: (courseId: string) =>
    api.get(`/courses/${courseId}/lessons`),

  get: (id: string) =>
    api.get<{ success: true; data: { lesson: LessonDetailDTO } }>(`/lessons/${id}`),

  create: (courseId: string, data: { topic: string; lessonDate?: string; contentMd?: string; githubUrls?: string[]; hidden?: boolean; order?: number }) =>
    api.post(`/courses/${courseId}/lessons`, data),

  update: (id: string, data: Partial<{ topic: string; lessonDate: string; contentMd: string; githubUrls: string[]; hidden: boolean; order: number }>) =>
    api.put(`/lessons/${id}`, data),

  delete: (id: string) =>
    api.delete(`/lessons/${id}`),

  reorder: (lessons: { id: string; order: number }[]) =>
    api.patch('/lessons/reorder', { lessons }),

  setProgress: (id: string, completed: boolean) =>
    api.post(`/lessons/${id}/progress`, { completed }),

  uploadFile: (id: string, file: File, name?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (name?.trim()) form.append('name', name.trim());
    return api.post(`/lessons/${id}/files`, form);
  },

  deleteFile: (id: string, fileId: string) =>
    api.delete(`/lessons/${id}/files/${fileId}`),

  importMd: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/lessons/${id}/import-md`, form);
  },

  getAccess: (id: string) =>
    api.get(`/lessons/${id}/access`),

  grantAccess: (id: string, studentId: string) =>
    api.post(`/lessons/${id}/access`, { studentId }),

  grantAccessBulk: (id: string, data: { groupId?: string; emails?: string[] }) =>
    api.post<{ success: true; data: { granted: number; notFound?: string[] } }>(`/lessons/${id}/access/bulk`, data),

  revokeAccess: (id: string, studentId: string) =>
    api.delete(`/lessons/${id}/access/${studentId}`),
};
