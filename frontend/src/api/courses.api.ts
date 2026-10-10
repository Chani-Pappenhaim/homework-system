import api from './axios';
import { uploadSignedThenRegister } from '@/lib/signed-upload';
import type { CourseDTO, CourseDetailDTO, StudentSummary } from '@/types';

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

  getAccess: (id: string) =>
    api.get<{ success: true; data: { students: StudentSummary[] } }>(`/courses/${id}/access`),

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
  uploadFile: async (id: string, file: File, name?: string, onProgress?: (percent: number) => void) => {
    const { data } = await api.post(`/courses/${id}/upload-signature`);
    return uploadSignedThenRegister(data.data, file, 'auto', (uploaded) =>
      api.post(`/courses/${id}/files`, {
        uploadedFile: { url: uploaded.secure_url, bytes: uploaded.bytes, originalName: file.name },
        name,
      }), onProgress);
  },

  deleteFile: (id: string, fileId: string) =>
    api.delete(`/courses/${id}/files/${fileId}`),

  renameFile: (id: string, fileId: string, name: string) =>
    api.patch(`/courses/${id}/files/${fileId}`, { name }),

  setFileHidden: (id: string, fileId: string, hidden: boolean) =>
    api.patch(`/courses/${id}/files/${fileId}/hidden`, { hidden }),
};
