import api from './axios';
import type { ChecklistResult } from '@/types';

export const gradesApi = {
  grade: (submissionId: string, data: { score?: number; feedback?: string; checklist?: ChecklistResult[] }) =>
    api.post(`/submissions/${submissionId}/grade`, data),

  report: (filters?: { groupId?: string; courseId?: string }) =>
    api.get('/grades/report', { params: filters }),

  pending: () =>
    api.get('/grades/pending'),

  /**
   * Fetched through axios rather than an <a download>: a plain navigation sends
   * cookies but not the Authorization header, and the route requires a Bearer
   * token with no cookie fallback — so the "download" was always a 401 JSON body.
   */
  exportReport: (filters?: { groupId?: string; courseId?: string }) =>
    api.get('/grades/report/export', { params: filters, responseType: 'blob' }),
};
