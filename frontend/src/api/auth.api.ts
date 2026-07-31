import api from './axios';
import type { UserDTO } from '@/types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ success: true; data: { user: UserDTO; accessToken: string } }>('/auth/login', { email, password }),

  logout: () => api.post('/auth/logout'),

  refresh: () =>
    api.post<{ success: true; data: { accessToken: string } }>('/auth/refresh'),

  me: () =>
    api.get<{ success: true; data: { user: UserDTO } }>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
};
