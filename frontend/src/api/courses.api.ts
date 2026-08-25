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

  /**
   * Uploads straight from the browser to Cloudinary using a signed, short-lived
   * request, then tells the backend only the resulting URL. The file's bytes
   * never pass through the server, avoiding the extra bandwidth cost of
   * relaying a buffered copy.
   */
  uploadFile: async (id: string, file: File, name?: string) => {
    const { data } = await api.post(`/courses/${id}/upload-signature`);
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

    return api.post(`/courses/${id}/files`, {
      uploadedFile: { url: uploaded.secure_url, bytes: uploaded.bytes, originalName: file.name },
      name,
    });
  },

  deleteFile: (id: string, fileId: string) =>
    api.delete(`/courses/${id}/files/${fileId}`),
};
