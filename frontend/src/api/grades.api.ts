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

/** A grade the uploaded sheet would change; only the changed fields are set. */
export interface PlannedGrade {
  rowNumber: number;
  submissionId: string;
  studentName: string;
  email: string;
  submissionScore?: number;
  contentScore?: number;
  feedback?: string;
  /** The content score would reach the student once published. */
  publishable: boolean;
}

/** What importing a grades sheet would do. */
export interface GradesImportPreview {
  updates: PlannedGrade[];
  /** Filled-in rows that match the grades already saved. */
  unchanged: number;
  /** Rows with nothing filled in. */
  empty: number;
  /** Hebrew, each naming its sheet row. */
  errors: string[];
}

export interface GradesImportResult {
  updated: number;
  unchanged: number;
  empty: number;
  /** Content scores made visible to students (and emailed). */
  published: number;
}

function sheetForm(file: File, publish?: boolean): FormData {
  const form = new FormData();
  form.append('file', file);
  if (publish !== undefined) form.append('publish', String(publish));
  return form;
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
  /** One assignment's sheet: the course's students listed, with the grades each already has. */
  downloadImportTemplate: (assignmentId: string) =>
    api.get(`/assignments/${assignmentId}/grades/import-template`, { responseType: 'blob' }),

  /** What the filled-in sheet would change; nothing is saved. */
  previewImport: (assignmentId: string, file: File) =>
    api.post<{ success: true; data: GradesImportPreview }>(`/assignments/${assignmentId}/grades/import/preview`, sheetForm(file)),

  /** Saves the sheet's grades, all or none. `publish` also shows the content scores to the students. */
  importGrades: (assignmentId: string, file: File, publish: boolean) =>
    api.post<{ success: true; data: GradesImportResult }>(`/assignments/${assignmentId}/grades/import`, sheetForm(file, publish)),

  exportReport: (filters?: ReportFilters) =>
    api.get('/grades/report/export', { params: filters, responseType: 'blob' }),
};
