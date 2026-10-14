import axios from 'axios';
import useAuthStore from '@/store/authStore';
import useServerStatus from '@/store/serverStatus';
import { API_URL } from '@/lib/config';
import { readJwtTimes } from '@/lib/jwt';

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

// ---------------------------------------------------------------------------
// Access-token refresh
// ---------------------------------------------------------------------------
// One refresh at a time: requests that need it meanwhile wait for the same one.
let refreshing: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = axios
      .post<{ success: true; data: { accessToken: string } }>(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((r) => {
        const token = r.data.data.accessToken;
        useAuthStore.getState().setAccessToken(token);
        return token;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Refresh shortly before the token runs out rather than after a request bounces
// with 401 — otherwise a large upload is sent in full, refused, and sent again.
const REFRESH_AHEAD_MS = 60_000;

// The browser's clock may be off. A token's `iat` is the server's clock at the
// moment it was issued, which is when it arrives here, so the gap between the
// two is recorded on arrival and expiry is measured by the server's clock.
let clockOffset = { token: null as string | null, ms: 0 };
function recordClockOffset(token: string | null) {
  if (!token || token === clockOffset.token) return;
  const iat = readJwtTimes(token)?.iat;
  clockOffset = { token, ms: iat ? iat * 1000 - Date.now() : 0 };
}
recordClockOffset(useAuthStore.getState().accessToken);
useAuthStore.subscribe((state) => recordClockOffset(state.accessToken));

function expiresSoon(token: string): boolean {
  const exp = readJwtTimes(token)?.exp;
  if (!exp) return false;
  const serverNow = Date.now() + (token === clockOffset.token ? clockOffset.ms : 0);
  return exp * 1000 - serverNow < REFRESH_AHEAD_MS;
}

// Signing in and refreshing do not use the access token.
const NO_TOKEN_URLS = ['/auth/login', '/auth/refresh'];
const isNoTokenUrl = (url?: string) => NO_TOKEN_URLS.some((u) => url?.startsWith(u));

// Pages that work signed out. An expired session must not pull someone off
// them - e.g. the reset-password link from an email, opened in a fresh tab.
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/verify-email', '/auth/callback'];

api.interceptors.request.use(async (config) => {
  // Count each logical request only once — a retry re-enters here with the same
  // config, and we must not double-count it or the banner never clears.
  if (!(config as any)._counted) {
    (config as any)._counted = true;
    requestStarted();
  }
  let token = useAuthStore.getState().accessToken;
  if (token && expiresSoon(token) && !isNoTokenUrl(config.url)) {
    try {
      token = await refreshAccessToken();
    } catch {
      // Send it as is: if the token really expired, the 401 handler below
      // retries the refresh and signs out when that fails too.
    }
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---------------------------------------------------------------------------
// Cold-start / transient-gateway auto-retry
// ---------------------------------------------------------------------------
const MAX_COLD_RETRIES = 4;

/**
 * Distinguishes an error returned by the application from one produced by
 * infrastructure in front of it (a gateway, a proxy).
 *
 * Every error the backend returns carries the {success:false, error} envelope.
 * A gateway that hasn't finished waking the app up cannot produce that shape —
 * it serves its own HTML page. So an envelope means the request reached the
 * app and the app decided, and retrying would only reach the same decision.
 */
function isApplicationResponse(error: any): boolean {
  const data = error?.response?.data;
  return typeof data === 'object' && data !== null && (data as any).success === false;
}

const SAFE_METHODS = ['get', 'head', 'options'];

function isColdStartError(error: any): boolean {
  // A timeout or a dropped connection may come after the server already acted
  // on the request; repeating a submission or a grade could do it twice. Only
  // read requests are retried blind — a write is retried only when a gateway
  // answered, which proves the app never saw it.
  const safe = SAFE_METHODS.includes(String(error?.config?.method ?? 'get').toLowerCase());
  if (error?.code === 'ECONNABORTED') return safe;  // client-side timeout
  if (!error?.response) return safe;                // no response at all (network / DNS / refused)
  if (isApplicationResponse(error)) return false;   // the app answered — retrying changes nothing
  return [502, 503, 504].includes(error.response.status); // gateway still bringing the app up
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (res) => { requestSettled(); return res; },
  async (error) => {
    const original = error.config;

    // A 401 from signing in or refreshing is the answer itself (wrong details,
    // no session) - the caller handles it; refreshing again would not help.
    if (error.response?.status === 401 && original && !original._retry && !isNoTokenUrl(original.url)) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        // Same logical request continues on the retry — do not settle here.
        return api(original);
      } catch {
        useAuthStore.getState().clearAuth();
        requestSettled();
        if (!PUBLIC_PATHS.includes(window.location.pathname)) {
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
