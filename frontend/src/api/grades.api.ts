import api from './axios';
import type { ChecklistResult, ReportRow } from '@/types';
import type { DayRange } from '@/lib/date-range';

/** Who to report on; the days are those the work was handed in on. */
export type ReportFilters = { groupId?: string; courseId?: string; studentId?: string } & DayRange;

/** Points off for each day late (a started day counts), never more than `max` in all. */
export interface LatePolicy {
  perDay: number;
  max: number;
}

export const gradesApi = {
  latePolicy: () =>
    api.get<{ success: true; data: LatePolicy }>('/grades/late-penalty'),

  updateLatePolicy: (policy: LatePolicy) =>
    api.put<{ success: true; data: LatePolicy }>('/grades/late-penalty', policy),

  grade: (submissionId: string, data: { submissionScore?: number; contentScore?: number; feedback?: string; checklist?: ChecklistResult[] }) =>
    api.post(`/submissions/${submissionId}/grade`, data),

  report: (filters?: ReportFilters) =>
    api.get<{ success: true; data: { report: ReportRow[] } }>('/grades/report', { params: filters }),

  pending: () =>
    api.get<{ success: true; data: { count: number } }>('/grades/pending'),

  /**
   * Fetched through axios rather than an <a download>: a plain navigation sends
   * cookies but not the Authorization header, and the route requires a Bearer
   * token with no cookie fallback — so the "download" was always a 401 JSON body.
   */
  exportReport: (filters?: ReportFilters) =>
    api.get('/grades/report/export', { params: filters, responseType: 'blob' }),
};
