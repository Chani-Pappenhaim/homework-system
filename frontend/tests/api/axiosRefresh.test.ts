import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import api from '@/api/axios';
import useAuthStore from '@/store/authStore';
import { followSessionChange } from '@/lib/sessionSync';

vi.mock('@/lib/sessionSync', () => ({ followSessionChange: vi.fn() }));

function token(iat: number, exp: number, sub = 'u1'): string {
  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub, iat, exp }))}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Store a token issued just now, then move the clock to half a minute before it expires. */
function tokenAboutToExpire(): string {
  const issued = token(nowSec(), nowSec() + 15 * 60);
  useAuthStore.getState().setAccessToken(issued);
  const later = Date.now() + 14.5 * 60 * 1000;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  return issued;
}

// Every request the instance sends lands here instead of the network.
let sent: { url?: string; auth?: string }[];
let respond: (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

beforeEach(() => {
  sent = [];
  respond = () => ({ status: 200, data: { success: true, data: {} } });
  api.defaults.adapter = async (config) => {
    sent.push({ url: config.url, auth: String(config.headers.Authorization ?? '') });
    const { status, data } = respond(config);
    const response = { data, status, statusText: '', headers: {}, config };
    if (status >= 400) {
      throw new axios.AxiosError('failed', undefined, config, undefined, response as any);
    }
    return response;
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ accessToken: null, user: null });
});

function mockRefresh(newToken: string) {
  return vi.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, data: { accessToken: newToken } } });
}

describe('refreshing the access token ahead of expiry', () => {
  it('sends a token with time left as is, without refreshing', async () => {
    const fresh = token(nowSec(), nowSec() + 15 * 60);
    useAuthStore.getState().setAccessToken(fresh);
    const post = mockRefresh('unused');

    await api.get('/courses');

    expect(post).not.toHaveBeenCalled();
    expect(sent).toEqual([{ url: '/courses', auth: `Bearer ${fresh}` }]);
  });

  it('refreshes first when the token runs out within a minute', async () => {
    tokenAboutToExpire();
    const renewed = token(nowSec(), nowSec() + 15 * 60, 'u1-new');
    const post = mockRefresh(renewed);

    await api.get('/courses');

    expect(post).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([{ url: '/courses', auth: `Bearer ${renewed}` }]);
    expect(useAuthStore.getState().accessToken).toBe(renewed);
  });

  it('shares a single refresh between requests sent together', async () => {
    tokenAboutToExpire();
    const post = mockRefresh(token(nowSec(), nowSec() + 15 * 60, 'u1-new'));

    await Promise.all([api.get('/a'), api.get('/b'), api.post('/c')]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(3);
  });

  it('measures expiry by the server clock when the browser clock is off', async () => {
    // The browser runs 10 minutes behind the server. The token was issued just
    // now by the server's clock and lasts 15 minutes; by the browser's own clock
    // it would look like 25 minutes are left, by the server's it has 15.
    const serverNow = nowSec() + 10 * 60;
    useAuthStore.getState().setAccessToken(token(serverNow, serverNow + 15 * 60));
    const post = mockRefresh('unused');

    await api.get('/courses');
    expect(post).not.toHaveBeenCalled();

    // 14.5 minutes later (by any clock) the token is half a minute from expiry.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 14.5 * 60 * 1000);
    post.mockResolvedValue({ data: { success: true, data: { accessToken: 'renewed' } } });
    await api.get('/courses');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not refresh ahead for the login and refresh calls themselves', async () => {
    tokenAboutToExpire();
    const post = mockRefresh('unused');

    await api.post('/auth/login', {});
    await api.post('/auth/refresh');

    expect(post).not.toHaveBeenCalled();
  });

  it('sends the old token when the refresh ahead fails, and lets the 401 decide', async () => {
    const old = tokenAboutToExpire();
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { success: true, data: { accessToken: 'renewed' } } });
    respond = (config) => String(config.headers.Authorization) === `Bearer ${old}`
      ? { status: 401, data: { success: false, error: 'expired' } }
      : { status: 200, data: { success: true, data: {} } };

    await api.get('/courses');

    expect(post).toHaveBeenCalledTimes(2);
    expect(sent.map((r) => r.auth)).toEqual([`Bearer ${old}`, 'Bearer renewed']);
  });
});

describe('a refresh that comes back for another user', () => {
  // Signing in as someone else in another tab replaces the shared refresh cookie.
  const tokenFor = (userId: string) => {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ userId, iat: nowSec(), exp: nowSec() + 900 }))}.sig`;
  };

  afterEach(() => vi.mocked(followSessionChange).mockClear());

  it('reloads as that user instead of sending the request under her name', async () => {
    useAuthStore.setState({ user: { id: 'teacher' } as any });
    tokenAboutToExpire();
    mockRefresh(tokenFor('student'));

    void api.get('/lessons/l1/quiz');

    await vi.waitFor(() => expect(followSessionChange).toHaveBeenCalledTimes(1));
    expect(sent).toEqual([]);
    expect(useAuthStore.getState().accessToken).not.toBe(tokenFor('student'));
  });

  it('carries on when the refreshed token is still hers', async () => {
    useAuthStore.setState({ user: { id: 'teacher' } as any });
    tokenAboutToExpire();
    const renewed = tokenFor('teacher');
    mockRefresh(renewed);

    await api.get('/courses');

    expect(followSessionChange).not.toHaveBeenCalled();
    expect(sent).toEqual([{ url: '/courses', auth: `Bearer ${renewed}` }]);
  });
});

describe('a session that cannot be refreshed', () => {
  const realLocation = window.location;
  let location: { pathname: string; href: string };

  function at(pathname: string) {
    location = { pathname, href: `http://localhost${pathname}` };
    Object.defineProperty(window, 'location', { configurable: true, value: location });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('takes a 401 from the refresh call itself as the answer, without refreshing again or redirecting', async () => {
    at('/reset-password');
    const post = vi.spyOn(axios, 'post');
    respond = () => ({ status: 401, data: { success: false, error: 'no session' } });

    await expect(api.post('/auth/refresh')).rejects.toMatchObject({ response: { status: 401 } });

    expect(post).not.toHaveBeenCalled();
    expect(location.href).toBe('http://localhost/reset-password');
  });

  it('takes a 401 from signing in as wrong details, without refreshing', async () => {
    at('/login');
    const post = vi.spyOn(axios, 'post');
    respond = () => ({ status: 401, data: { success: false, error: 'wrong password' } });

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(post).not.toHaveBeenCalled();
  });

  it('leaves someone on a signed-out page, such as the reset-password link', async () => {
    at('/reset-password');
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('no session'));
    respond = () => ({ status: 401, data: { success: false, error: 'expired' } });

    await expect(api.get('/courses')).rejects.toBeTruthy();
    expect(location.href).toBe('http://localhost/reset-password');
  });

  it('still sends someone on a signed-in page back to the login', async () => {
    at('/teacher/groups');
    useAuthStore.getState().setAccessToken('expired');
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('no session'));
    respond = () => ({ status: 401, data: { success: false, error: 'expired' } });

    await expect(api.get('/groups')).rejects.toBeTruthy();
    expect(location.href).toBe('/login');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
