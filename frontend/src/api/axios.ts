import axios from 'axios';
import useAuthStore from '@/store/authStore';
import useServerStatus from '@/store/serverStatus';
import { API_URL } from '@/lib/config';
import { readJwtTimes, readJwtUserId } from '@/lib/jwt';
import { isPublicPath } from '@/lib/publicPaths';
import { followSessionChange } from '@/lib/sessionSync';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  // Allows a minute for a free-tier cold start (Render) before the request counts as failed.
  timeout: 60000,
});

// ---------------------------------------------------------------------------
// "Server is waking up" indicator
// ---------------------------------------------------------------------------
// In-flight requests are counted once each across retries; if any is still pending after
// WAKE_DELAY the banner shows, and clears once all settle.
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

/** Ends the banner's count for a request that was counted when it started. */
function settle(config: any) {
  if (config?._tracked) requestSettled();
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
        // The refresh cookie is shared across tabs; if another user signed in since, reload as
        // them instead of sending this tab's requests under their name.
        const user = useAuthStore.getState().user;
        const tokenUser = readJwtUserId(token);
        if (user && tokenUser && tokenUser !== user.id) {
          followSessionChange();
          refreshing = null; // the promise below never settles, so `finally` won't clear it
          return new Promise<string>(() => {});
        }
        useAuthStore.getState().setAccessToken(token);
        return token;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Refresh shortly before expiry, so a large upload is not sent in full, refused with 401 and resent.
const REFRESH_AHEAD_MS = 60_000;

// The browser's clock may be off, so the offset from the token's server-side `iat` is recorded
// on arrival and expiry is measured by the server's clock.
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

api.interceptors.request.use(async (config) => {
  // A retry re-enters here with the same config; counting it twice would keep the banner up.
  if (!(config as any)._counted) {
    (config as any)._counted = true;
    // Uploads are slow by size, not a sleeping server, so they never raise the banner.
    if (!(config.data instanceof FormData)) {
      (config as any)._tracked = true;
      requestStarted();
    }
  }
  let token = useAuthStore.getState().accessToken;
  if (token && expiresSoon(token) && !isNoTokenUrl(config.url)) {
    try {
      token = await refreshAccessToken();
    } catch {
      // Sent as is; the 401 handler below retries the refresh and signs out if that fails.
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
 * Tells an application error from one produced by a gateway or proxy. Backend errors carry the
 * {success:false, error} envelope, which a gateway cannot produce, so an envelope means the app
 * decided and a retry would not change it.
 */
function isApplicationResponse(error: any): boolean {
  const data = error?.response?.data;
  return typeof data === 'object' && data !== null && (data as any).success === false;
}

const SAFE_METHODS = ['get', 'head', 'options'];

function isColdStartError(error: any): boolean {
  // A timeout may follow a request the server already acted on, so only reads are retried blind;
  // a write is retried only when a gateway answered, which proves the app never saw it.
  const safe = SAFE_METHODS.includes(String(error?.config?.method ?? 'get').toLowerCase());
  if (error?.code === 'ECONNABORTED') return safe;  // client-side timeout
  if (!error?.response) return safe;                // no response at all (network / DNS / refused)
  if (isApplicationResponse(error)) return false;   // the app answered - retrying changes nothing
  return [502, 503, 504].includes(error.response.status); // gateway still bringing the app up
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (res) => { settle(res.config); return res; },
  async (error) => {
    const original = error.config;

    // A 401 from signing in or refreshing is the answer itself; the caller handles it.
    if (error.response?.status === 401 && original && !original._retry && !isNoTokenUrl(original.url)) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        // Same logical request continues on the retry — do not settle here.
        return api(original);
      } catch {
        useAuthStore.getState().clearAuth();
        settle(original);
        if (!isPublicPath(window.location.pathname)) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    // Backend likely cold-starting: retry with growing backoff, keeping the banner up meanwhile.
    if (original && isColdStartError(error) && (original._coldRetries ?? 0) < MAX_COLD_RETRIES) {
      original._coldRetries = (original._coldRetries ?? 0) + 1;
      await delay(2000 * original._coldRetries); // 2s, 4s, 6s, 8s
      return api(original);
    }

    settle(original);
    return Promise.reject(error);
  }
);

export default api;
