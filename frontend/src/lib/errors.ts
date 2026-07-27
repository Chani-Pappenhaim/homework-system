// Turns any thrown request error into a message that is safe and friendly to
// show a user. The backend already hides internal 5xx details behind a generic
// message; this covers the cases the backend can't speak to — no response at
// all (server down / network / CORS) and truly unknown shapes.

const NETWORK_MESSAGE =
  'לא הצלחנו להתחבר לשרת. אנא בדקו את חיבור האינטרנט ונסו שוב מאוחר יותר.';
const GENERIC_MESSAGE = 'אירעה שגיאה. אנא נסו שוב מאוחר יותר.';

export function getApiErrorMessage(error: any, fallback: string = GENERIC_MESSAGE): string {
  // Axios sets `response` only when the server actually answered. No response =
  // the request never completed (offline, DNS, connection refused, timeout).
  if (error && typeof error === 'object' && 'isAxiosError' in error && !error.response) {
    return NETWORK_MESSAGE;
  }

  const serverMessage = error?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) {
    return serverMessage;
  }

  return fallback;
}
