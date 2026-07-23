import axios from 'axios';
import useAuthStore from '@/store/authStore';
import useServerStatus from '@/store/serverStatus';
import { API_URL } from '@/lib/config';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  // Free-tier hosts (Render) spin the backend down after inactivity; the first
  // request then waits for a cold start. Give it up to a minute before treating
  // the request as failed — the cold-start retry below handles the rest.
  timeout: 60000,
});

// ---------------------------------------------------------------------------
// "Server is waking up" indicator
// ---------------------------------------------------------------------------
// Count in-flight requests once each (across their retries). If anything is
// still pending after WAKE_DELAY, the backend is almost certainly cold-starting,
// so flip the global banner on; clear it once everything settles.
const WAKE_DELAY = 4000;
let inFlight = 0;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function requestStarted() {
  inFlight++;
  if (wakeTimer === null) {
    wakeTimer = setTimeout(() => useServerStatus.getState().setWaking(true), WAKE_DELAY);
  }
}

function requestSettled() {
  inFlight = Math.max(0, inFlight - 1);
  if (inFlight === 0) {
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
    useServerStatus.getState().setWaking(false);
  }
}

api.interceptors.request.use((config) => {
  // Count each logical request only once — a retry re-enters here with the same
  // config, and we must not double-count it or the banner never clears.
  if (!(config as any)._counted) {
    (config as any)._counted = true;
    requestStarted();
  }
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---------------------------------------------------------------------------
// Cold-start / transient-gateway auto-retry
// ---------------------------------------------------------------------------
const MAX_COLD_RETRIES = 4;

function isColdStartError(error: any): boolean {
  if (error?.code === 'ECONNABORTED') return true; // client-side timeout
  if (!error?.response) return true;                // no response at all (network / DNS / refused)
  return [502, 503, 504].includes(error.response.status); // gateway still bringing the app up
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => { requestSettled(); return res; },
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        if (!refreshing) {
          refreshing = axios
            .post<{ success: true; data: { accessToken: string } }>(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
            .then((r) => r.data.data.accessToken)
            .finally(() => { refreshing = null; });
        }
        const token = await refreshing;
        useAuthStore.getState().setAccessToken(token);
        original.headers.Authorization = `Bearer ${token}`;
        // Same logical request continues on the retry — do not settle here.
        return api(original);
      } catch {
        useAuthStore.getState().clearAuth();
        requestSettled();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    // Backend likely cold-starting or the gateway is still bringing it up: retry
    // a few times with a growing backoff. The banner stays up meanwhile because
    // we don't settle the counter between attempts.
    if (original && isColdStartError(error) && (original._coldRetries ?? 0) < MAX_COLD_RETRIES) {
      original._coldRetries = (original._coldRetries ?? 0) + 1;
      await delay(2000 * original._coldRetries); // 2s, 4s, 6s, 8s
      return api(original);
    }

    requestSettled();
    return Promise.reject(error);
  }
);

export default api;
