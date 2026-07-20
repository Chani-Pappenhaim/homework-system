// Single source of truth for the backend origin. Every request — XHR, token
// refresh, and the OAuth redirects — must hit the same backend so the httpOnly
// refresh cookie (set on the backend's own domain) is sent back on every call.
//
// - Local dev / single-origin nginx: leave VITE_API_URL unset. API_BASE_URL is ''
//   and requests use relative '/api', proxied to the backend on the same origin.
// - Split deploy (SPA on Vercel, API elsewhere): set VITE_API_URL to the backend
//   origin so calls go straight to it instead of the SPA host.
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

// Full base for API calls, e.g. '' -> '/api', 'https://api.x.com' -> 'https://api.x.com/api'.
export const API_URL = `${API_BASE_URL}/api`;
