import api from './axios';

export interface SiteNames {
  brandName: string;
  teacherName: string;
}

export const siteApi = {
  /** Public: the names are shown before sign-in too. */
  get: () => api.get<{ success: true; data: SiteNames }>('/site'),
  update: (names: { brandName: string; teacherName: string }) =>
    api.put<{ success: true; data: SiteNames }>('/site', names),
};
