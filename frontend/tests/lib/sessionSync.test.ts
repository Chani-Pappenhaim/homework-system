import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useAuthStore from '@/store/authStore';
import {
  startSessionSync, stopSessionSync, takeSessionNotice, SWITCHED_NOTICE, SIGNED_OUT_NOTICE,
} from '@/lib/sessionSync';
import type { UserDTO } from '@/types';

const user = (id: string) => ({ id, name: id, email: `${id}@x.com`, role: 'ADMIN' }) as UserDTO;

// Another tab of the same browser.
let otherTab: BroadcastChannel;
let heard: unknown[];

const realLocation = window.location;
let location: { pathname: string; href: string; reload: ReturnType<typeof vi.fn> };

function at(pathname: string) {
  location = { pathname, href: `http://localhost${pathname}`, reload: vi.fn() };
  Object.defineProperty(window, 'location', { configurable: true, value: location });
}

/** A message from the other tab, and time for it to arrive. */
async function otherTabSays(userId: string | null) {
  otherTab.postMessage({ userId });
  await new Promise((r) => setTimeout(r, 20));
}

beforeEach(() => {
  sessionStorage.clear();
  useAuthStore.setState({ user: null, accessToken: null, status: 'ready' });
  startSessionSync();
  heard = [];
  otherTab = new BroadcastChannel('homework-session');
  otherTab.onmessage = (e) => heard.push(e.data);
  at('/teacher');
});

afterEach(() => {
  otherTab.close();
  stopSessionSync();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('announcing this tab', () => {
  it('tells the other tabs who signed in and who signed out', async () => {
    useAuthStore.getState().setAuth(user('teacher'), 't');
    useAuthStore.getState().clearAuth();
    await vi.waitFor(() => expect(heard).toEqual([{ userId: 'teacher' }, { userId: null }]));
  });

  it('says nothing when only the access token changes', async () => {
    useAuthStore.getState().setAuth(user('teacher'), 't');
    useAuthStore.getState().setAccessToken('t2');
    await new Promise((r) => setTimeout(r, 20));
    expect(heard).toEqual([{ userId: 'teacher' }]);
  });
});

describe('following another tab', () => {
  it('reloads as the new user when another tab signed in as someone else, with a notice', async () => {
    useAuthStore.setState({ user: user('teacher') });
    await otherTabSays('student');
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(takeSessionNotice()).toBe(SWITCHED_NOTICE);
  });

  it('stays put when the other tab is the same user', async () => {
    useAuthStore.setState({ user: user('teacher') });
    await otherTabSays('teacher');
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('signs out and goes to the login when another tab signed out', async () => {
    useAuthStore.setState({ user: user('teacher'), accessToken: 't' });
    await otherTabSays(null);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(location.href).toBe('/login');
    expect(takeSessionNotice()).toBe(SIGNED_OUT_NOTICE);
  });

  it('lets the login page follow someone signing in elsewhere, without a notice', async () => {
    at('/login');
    await otherTabSays('teacher');
    expect(location.reload).toHaveBeenCalledTimes(1);
    expect(takeSessionNotice()).toBeNull();
  });

  it('leaves a signed-out page such as a reset-password link alone', async () => {
    at('/reset-password');
    await otherTabSays('teacher');
    expect(location.reload).not.toHaveBeenCalled();
  });

  it('ignores the other tabs while still restoring its own session', async () => {
    useAuthStore.setState({ status: 'loading' });
    await otherTabSays('student');
    expect(location.reload).not.toHaveBeenCalled();
  });
});

describe('takeSessionNotice', () => {
  it('hands the notice over once', async () => {
    useAuthStore.setState({ user: user('teacher') });
    await otherTabSays('student');
    expect(takeSessionNotice()).toBe(SWITCHED_NOTICE);
    expect(takeSessionNotice()).toBeNull();
  });
});
