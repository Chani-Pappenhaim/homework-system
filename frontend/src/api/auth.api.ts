import api from './axios';
import type { UserDTO } from '@/types';

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ success: true; data: { user: UserDTO; accessToken: string } }>('/auth/login', { email, password }),

  logout: () => api.post('/auth/logout'),

  /** Signs out every other device; this one continues on the returned token. */
  logoutOthers: () =>
    api.post<{ success: true; data: { accessToken: string } }>('/auth/logout-others'),

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

  updateMe: (data: Partial<{ name: string; email: string; githubUsername: string; emailNotifications: boolean }>) =>
    api.patch<{ success: true; data: { user: UserDTO; emailChanged: boolean } }>('/auth/me', data),

  /** Replaces the signed-in user's own profile picture. */
  updateAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.put<{ success: true; data: { user: UserDTO } }>('/auth/me/avatar', form);
  },

  removeAvatar: () =>
    api.delete<{ success: true; data: { user: UserDTO } }>('/auth/me/avatar'),

  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }),

  resendVerification: () =>
    api.post('/auth/verify-email/resend'),
};
