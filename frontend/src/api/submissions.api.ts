import api from './axios';

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
   * URL. The file's bytes never pass through the Node process — a full video
   * buffered in memory was pushing Render past its 512MB limit.
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
    api.get('/submissions/mine'),

  get: (id: string) =>
    api.get(`/submissions/${id}`),

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
