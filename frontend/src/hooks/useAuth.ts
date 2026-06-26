import { useEffect } from 'react';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';

export function useBootstrapAuth() {
  const { accessToken, setAuth } = useAuthStore();

  useEffect(() => {
    if (accessToken) return;
    authApi.refresh()
      .then(async (r) => {
        const token = r.data.data.accessToken;
        const me = await authApi.me();
        setAuth(me.data.data.user, token);
      })
      .catch(() => {});
  }, []);
}
