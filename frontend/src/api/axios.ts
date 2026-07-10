import axios from 'axios';
import useAuthStore from '@/store/authStore';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = axios
            .post<{ success: true; data: { accessToken: string } }>('/api/auth/refresh', {}, { withCredentials: true })
            .then((r) => r.data.data.accessToken)
            .finally(() => { refreshing = null; });
        }
        const token = await refreshing;
        useAuthStore.getState().setAccessToken(token);
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
