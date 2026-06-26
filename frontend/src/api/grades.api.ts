import api from './axios';
import type { ChecklistResult } from '@/types';

export const gradesApi = {
  grade: (submissionId: string, data: { score?: number; feedback?: string; checklist?: ChecklistResult[] }) =>
    api.post(`/submissions/${submissionId}/grade`, data),

  report: (filters?: { groupId?: string; courseId?: string }) =>
    api.get('/grades/report', { params: filters }),

  pending: () =>
    api.get('/grades/pending'),

  exportUrl: (filters?: { groupId?: string; courseId?: string }) => {
    const params = new URLSearchParams(filters as Record<string, string>).toString();
    return `/api/grades/report/export${params ? `?${params}` : ''}`;
  },
};
