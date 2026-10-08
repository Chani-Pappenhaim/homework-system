import api from './axios';
import type { StudentSummary } from '@/types';

export interface StudentSearchResult {
  id: string;
  name: string;
  email: string;
  groupNames: string[];
}

export const studentsApi = {
  findByEmail: (email: string) =>
    api.get<{ success: true; data: { student: StudentSummary | null } }>('/students', { params: { email } }),
  search: (query: string) =>
    api.get<{ success: true; data: { students: StudentSearchResult[] } }>('/students', { params: { search: query } }),
  /** A student with no group, for private lessons or a single course. */
  create: (data: { name: string; email: string; githubUsername?: string }) =>
    api.post<{ success: true; data: { student: StudentSummary } }>('/students', data),
};
