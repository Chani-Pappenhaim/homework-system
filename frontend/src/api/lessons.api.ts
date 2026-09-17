import api from './axios';
import type { LessonDetailDTO, StudentSummary } from '@/types';

export const lessonsApi = {
  list: (courseId: string) =>
    api.get(`/courses/${courseId}/lessons`),

  get: (id: string) =>
    api.get<{ success: true; data: { lesson: LessonDetailDTO } }>(`/lessons/${id}`),

  create: (courseId: string, data: { topic: string; lessonDate?: string; contentMd?: string; githubUrls?: string[]; hidden?: boolean; order?: number }) =>
    api.post<{ success: true; data: { lesson: { id: string } } }>(`/courses/${courseId}/lessons`, data),

  update: (id: string, data: Partial<{ topic: string; lessonDate: string; contentMd: string; githubUrls: string[]; hidden: boolean; order: number }>) =>
    api.put(`/lessons/${id}`, data),

  delete: (id: string) =>
    api.delete(`/lessons/${id}`),

  reorder: (lessons: { id: string; order: number }[]) =>
    api.patch('/lessons/reorder', { lessons }),

  setProgress: (id: string, completed: boolean) =>
    api.post(`/lessons/${id}/progress`, { completed }),

  /**
   * Uploads straight from the browser to Cloudinary using a signed, short-lived
   * request, then tells the backend only the resulting URL. The file's bytes
   * never pass through the server, avoiding the extra bandwidth cost of
   * relaying a buffered copy.
   */
  uploadFile: async (id: string, file: File, name?: string) => {
    const { data } = await api.post(`/lessons/${id}/upload-signature`);
    const { apiKey, cloudName, timestamp, signature, folder } = data.data;

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
    if (!uploadRes.ok) throw new Error('File upload to storage failed');
    const uploaded = await uploadRes.json();

    return api.post(`/lessons/${id}/files`, {
      uploadedFile: { url: uploaded.secure_url, bytes: uploaded.bytes, originalName: file.name },
      name,
    });
  },

  deleteFile: (id: string, fileId: string) =>
    api.delete(`/lessons/${id}/files/${fileId}`),

  renameFile: (id: string, fileId: string, name: string) =>
    api.patch(`/lessons/${id}/files/${fileId}`, { name }),

  setFileRequired: (id: string, fileId: string, required: boolean) =>
    api.patch(`/lessons/${id}/files/${fileId}/required`, { required }),

  markFileViewed: (id: string, fileId: string) =>
    api.post(`/lessons/${id}/files/${fileId}/view`),

  unmarkFileViewed: (id: string, fileId: string) =>
    api.delete(`/lessons/${id}/files/${fileId}/view`),

  importMd: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/lessons/${id}/import-md`, form);
  },

  getAccess: (id: string) =>
    api.get<{ success: true; data: { students: StudentSummary[] } }>(`/lessons/${id}/access`),

  grantAccess: (id: string, studentId: string) =>
    api.post(`/lessons/${id}/access`, { studentId }),

  grantAccessBulk: (id: string, data: { groupId?: string; emails?: string[] }) =>
    api.post<{ success: true; data: { granted: number; notFound?: string[] } }>(`/lessons/${id}/access/bulk`, data),

  revokeAccess: (id: string, studentId: string) =>
    api.delete(`/lessons/${id}/access/${studentId}`),
};
