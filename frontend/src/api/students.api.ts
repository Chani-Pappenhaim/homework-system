import api from './axios';

export interface StudentSearchResult {
  id: string;
  name: string;
  email: string;
  groupNames: string[];
}

export const studentsApi = {
  search: (query: string) =>
    api.get<{ success: true; data: { students: StudentSearchResult[] } }>('/students', { params: { search: query } }),
};
