import { useEffect } from 'react';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';

/**
 * Restores the session from the httpOnly refresh cookie on a cold load.
 * Must always land on status 'ready', success or failure, or the guards spin.
 */
export function useBootstrapAuth() {
  const { accessToken, setAuth, setReady } = useAuthStore();

  useEffect(() => {
    if (accessToken) { setReady(); return; }
    authApi.refresh()
      .then(async (r) => {
        const token = r.data.data.accessToken;
        const me = await authApi.me();
        setAuth(me.data.data.user, token);
      })
      .catch(() => setReady());
  }, []);
}
