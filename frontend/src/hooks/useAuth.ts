import { useEffect } from 'react';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';

/**
 * Restores the session from the httpOnly refresh cookie on a cold load.
 * Must always land on status 'ready', success or failure, or the guards spin.
 */
export function useBootstrapAuth() {
  const { accessToken, setAuth, setAccessToken, setReady } = useAuthStore();

  useEffect(() => {
    if (accessToken) { setReady(); return; }
    authApi.refresh()
      .then(async (r) => {
        const token = r.data.data.accessToken;
        // Store the token before calling /me — the axios interceptor reads it
        // from the store at request time, so /me would otherwise go out
        // unauthenticated and log a spurious 401 before the retry logic saves it.
        setAccessToken(token);
        const me = await authApi.me();
        setAuth(me.data.data.user, token);
      })
      .catch(() => setReady());
  }, []);
}
