import api from './axios';
import type { StudentSummary } from '@/types';

export const studentsApi = {
  findByEmail: (email: string) =>
    api.get<{ success: true; data: { student: StudentSummary | null } }>('/students', { params: { email } }),
};
