// Turns any thrown request error into a message that is safe and friendly to
// show a user. The backend already hides internal 5xx details behind a generic
// message; this covers the cases the backend can't speak to — no response at
// all (server down / network / CORS) and truly unknown shapes.

const NETWORK_MESSAGE =
  'לא הצלחנו להתחבר לשרת. אנא בדקו את חיבור האינטרנט ונסו שוב מאוחר יותר.';
// A timeout is not the user's connection: the server was too slow to answer,
// typically while a free-tier host is still starting up.
const TIMEOUT_MESSAGE =
  'השרת לא הגיב בזמן - ייתכן שהוא עדיין מתעורר אחרי זמן בלי שימוש. נסו שוב בעוד דקה.';
const GENERIC_MESSAGE = 'אירעה שגיאה. אנא נסו שוב מאוחר יותר.';

export function getApiErrorMessage(error: any, fallback: string = GENERIC_MESSAGE): string {
  // Direct-to-storage uploads (Cloudinary) never go through axios/our backend,
  // so they already carry a ready-to-show Hebrew message — use it as-is.
  if (error && typeof error === 'object' && error.isUploadError && typeof error.message === 'string') {
    return error.message;
  }

  // Axios sets `response` only when the server actually answered. No response =
  // the request never completed (offline, DNS, connection refused, timeout).
  if (error && typeof error === 'object' && 'isAxiosError' in error && !error.response) {
    return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' ? TIMEOUT_MESSAGE : NETWORK_MESSAGE;
  }

  const serverMessage = error?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) {
    return serverMessage;
  }

  return fallback;
}
