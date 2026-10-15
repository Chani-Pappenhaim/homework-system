import useAuthStore from '@/store/authStore';
import { isPublicPath } from '@/lib/publicPaths';

/**
 * A browser holds a single refresh cookie, so it is signed in as one user at a
 * time: signing in as someone else in one tab replaces the session of every
 * other tab too. Left alone, a tab only finds out at its next token refresh (up
 * to 15 minutes later) and meanwhile shows one user while acting as another.
 *
 * So every tab announces who it is signed in as. A tab showing someone else
 * reloads as the new user, signing out in one tab signs out all of them, and a
 * short notice after the reload says why the page changed.
 */

const CHANNEL_NAME = 'homework-session';
const NOTICE_KEY = 'session-sync-notice';

export const SWITCHED_NOTICE = 'בלשונית אחרת נכנסו לחשבון אחר, ולכן גם הלשונית הזו עברה אליו. בדפדפן אחד אפשר להיות מחוברים לחשבון אחד בלבד';
export const SIGNED_OUT_NOTICE = 'יצאת מהחשבון בלשונית אחרת';

let channel: BroadcastChannel | null = null;
let unsubscribe: (() => void) | null = null;

export function startSessionSync() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent<{ userId?: string | null }>) => onOtherTab(e.data?.userId ?? null);
  unsubscribe = useAuthStore.subscribe((state, prev) => {
    const userId = state.user?.id ?? null;
    if (userId !== (prev.user?.id ?? null)) channel?.postMessage({ userId });
  });
}

/** For tests: forget the channel so the next start opens a fresh one. */
export function stopSessionSync() {
  unsubscribe?.();
  channel?.close();
  channel = null;
  unsubscribe = null;
}

function onOtherTab(userId: string | null) {
  const { user, status } = useAuthStore.getState();
  // Still restoring the session: it reads the current cookie anyway.
  if (status !== 'ready') return;
  const mine = user?.id ?? null;
  if (userId === mine) return;

  if (userId === null) {
    useAuthStore.getState().clearAuth();
    if (!isPublicPath(window.location.pathname)) {
      leaveNotice(SIGNED_OUT_NOTICE);
      window.location.href = '/login';
    }
    return;
  }
  // Signed out here: only the login page follows someone signing in; a reset
  // or verify link opened meanwhile stays where it is.
  if (mine === null && window.location.pathname !== '/login') return;
  followSessionChange();
}

/**
 * The browser's session now belongs to another user: reload as that user. Also
 * called when a token refresh comes back for someone else - the announcement
 * from the other tab may never have arrived (e.g. this tab was asleep).
 */
export function followSessionChange() {
  if (useAuthStore.getState().user) leaveNotice(SWITCHED_NOTICE);
  window.location.reload();
}

function leaveNotice(message: string) {
  try { sessionStorage.setItem(NOTICE_KEY, message); } catch { /* storage blocked: no notice */ }
}

/** The notice left before the last reload, once; null if there is none. */
export function takeSessionNotice(): string | null {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY);
    if (message) sessionStorage.removeItem(NOTICE_KEY);
    return message;
  } catch {
    return null;
  }
}
