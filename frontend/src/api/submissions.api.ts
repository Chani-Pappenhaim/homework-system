import api from './axios';
import type { MySubmission, PendingAssignment, SubmissionDTO } from '@/types';

/** Videos are the one submission type large enough to threaten the backend's memory limit. */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'].includes(ext);
}

export const submissionsApi = {
  submitFile: (assignmentId: string, file: File, notes?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return api.post(`/assignments/${assignmentId}/submit`, form);
  },

  /**
   * Videos skip the backend entirely: get a signed Cloudinary URL, upload the
   * file straight from the browser, then tell the backend only the resulting
   * URL. Keeps large video files from ever being buffered in server memory.
   */
  submitVideo: async (assignmentId: string, file: File, notes?: string) => {
    const { data } = await api.post(`/assignments/${assignmentId}/video-upload-signature`);
    const { apiKey, cloudName, timestamp, signature, folder } = data.data;

    const form = new FormData();
    form.append('file', file);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);

    const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
      method: 'POST',
      body: form,
    });
    if (!uploadRes.ok) throw new Error('Video upload to storage failed');
    const uploaded = await uploadRes.json();

    return api.post(`/assignments/${assignmentId}/submit`, {
      uploadedFile: { url: uploaded.secure_url, originalName: file.name },
      notes,
    });
  },

  submitRepo: (assignmentId: string, repoName: string, notes?: string) =>
    api.post(`/assignments/${assignmentId}/submit`, { repoName, notes }),

  mine: () =>
    api.get<{ success: true; data: { pending: PendingAssignment[]; submitted: MySubmission[] } }>('/submissions/mine'),

  get: (id: string) =>
    api.get<{ success: true; data: { submission: SubmissionDTO } }>(`/submissions/${id}`),

  importSubmissions: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/submissions/import', form);
  },

  requestAiReview: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/request-ai-review`),

  approveAi: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/approve-ai`),

  allowExtraAi: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/allow-extra-ai`),

  restoreAiScore: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/restore-ai-score`),
};
