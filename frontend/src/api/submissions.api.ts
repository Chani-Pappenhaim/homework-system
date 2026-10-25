import api from './axios';
import { uploadSignedThenRegister } from './signed-upload';
import type { MySubmission, PendingAssignment, SubmissionDTO } from '@/types';

/** Videos are the one submission type large enough to threaten the backend's memory limit. */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'm4v'].includes(ext);
}

/** Per-row outcome of an Excel submissions import; each error names its sheet row. */
export interface SubmissionsImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AssignmentSubmissionsImportResult {
  /** Submissions saved or changed. */
  imported: number;
  /** Rows whose repo already was the student's submission. */
  unchanged: number;
  /** Students left without a repo in the sheet. */
  empty: number;
  errors: string[];
}

export const submissionsApi = {
  submitFile: (assignmentId: string, file: File, notes?: string, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return api.post(`/assignments/${assignmentId}/submit`, form, {
      onUploadProgress: (e) => {
        if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  },

  /**
   * Videos skip the backend entirely: get a signed Cloudinary URL, upload the
   * file straight from the browser, then tell the backend only the resulting
   * URL. Keeps large video files from ever being buffered in server memory.
   */
  submitVideo: async (assignmentId: string, file: File, notes?: string, onProgress?: (percent: number) => void) => {
    const { data } = await api.post(`/assignments/${assignmentId}/video-upload-signature`, { tagged: true });
    return uploadSignedThenRegister(data.data, file, 'video', (uploaded) =>
      api.post(`/assignments/${assignmentId}/submit`, {
        uploadedFile: { url: uploaded.secure_url, originalName: file.name },
        notes,
      }), onProgress);
  },

  submitRepo: (assignmentId: string, repoName: string, notes?: string) =>
    api.post(`/assignments/${assignmentId}/submit`, { repoName, notes }),

  mine: () =>
    api.get<{ success: true; data: { pending: PendingAssignment[]; submitted: MySubmission[] } }>('/submissions/mine'),

  get: (id: string) =>
    api.get<{ success: true; data: { submission: SubmissionDTO } }>(`/submissions/${id}`),

  /** Student-only: deletes her own submission so the assignment can be submitted again. */
  deleteMine: (submissionId: string) =>
    api.delete(`/submissions/${submissionId}`),

  /** The teacher deletes a student's submission, checked or not. */
  deleteAsTeacher: (submissionId: string) =>
    api.delete(`/submissions/${submissionId}/as-teacher`),

  importSubmissions: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ success: true; data: SubmissionsImportResult }>('/submissions/import', form);
  },

  downloadImportTemplate: () =>
    api.get('/submissions/import-template', { responseType: 'blob' }),

  /** One assignment's sheet: the course's students listed, with the repo each already submitted. */
  downloadAssignmentImportTemplate: (assignmentId: string) =>
    api.get(`/assignments/${assignmentId}/submissions/import-template`, { responseType: 'blob' }),

  importAssignmentSubmissions: (assignmentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ success: true; data: AssignmentSubmissionsImportResult }>(`/assignments/${assignmentId}/submissions/import`, form);
  },

  requestAiReview: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/request-ai-review`),

  /** Teacher-only: runs the AI review again, outside the student's attempt limit. */
  rerunAiReview: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/rerun-ai-review`),

  approveAi: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/approve-ai`),

  /** Teacher-only: corrects the AI's score and/or comments. */
  updateAiReview: (submissionId: string, data: { aiScore?: number; aiVerbalReview?: string | null; aiCodeReview?: string | null }) =>
    api.patch(`/submissions/${submissionId}/ai-review`, data),

  allowExtraAi: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/allow-extra-ai`),

  /** Lets the student delete or replace a submission the teacher already checked, or takes that back. */
  allowChanges: (submissionId: string, allowed: boolean) =>
    api.post(`/submissions/${submissionId}/allow-changes`, { allowed }),

  restoreAiScore: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/restore-ai-score`),

  approveContent: (submissionId: string) =>
    api.post(`/submissions/${submissionId}/approve-content`),

  bulkApproveContent: (submissionIds: string[]) =>
    api.post<{ success: true; data: { approved: number; skipped: number } }>(`/submissions/bulk-approve-content`, { submissionIds }),
};
