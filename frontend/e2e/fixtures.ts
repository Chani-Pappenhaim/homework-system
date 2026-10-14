import { test as base, type Page, type Route } from '@playwright/test';

export const teacher = {
  id: 't1', name: 'עדי שלום', email: 'teacher@example.com', role: 'ADMIN',
  mustChangePassword: false, githubUsername: null, emailVerified: true, emailNotifications: true, groups: [],
};

type Handler = (route: Route) => unknown;

export interface ApiMock {
  /** Answer `METHOD /path` (path after /api, no query string) with this handler. */
  on(method: string, path: string, handler: Handler): void;
  /** Requests the app made, as `METHOD /path`. */
  calls: string[];
}

export const json = (status: number, body: unknown) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
export const ok = (data: unknown) => json(200, { success: true, data });
export const fail = (status: number, error: string) => json(status, { success: false, error });

/**
 * Every /api call is answered here. Signed out by default (refresh -> 401);
 * anything not set up answers an empty success, which the pages render as
 * "no data" - enough for flows that only care about one or two endpoints.
 */
async function mockApi(page: Page): Promise<ApiMock> {
  const handlers = new Map<string, Handler>();
  const calls: string[] = [];
  handlers.set('POST /auth/refresh', fail(401, 'No session'));
  // Only the app's own /api calls - vite also serves modules under /src/api/.
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname.slice('/api'.length)}`;
    calls.push(key);
    return (handlers.get(key) ?? ok({}))(route);
  });
  return { on: (method, path, handler) => { handlers.set(`${method} ${path}`, handler); }, calls };
}

/** Signs the browser in as `user` through the same refresh-cookie bootstrap the app uses. */
export function signIn(api: ApiMock, user: Record<string, unknown> = teacher) {
  api.on('POST', '/auth/refresh', ok({ accessToken: 'e2e-token' }));
  api.on('GET', '/auth/me', ok({ user }));
}

export const test = base.extend<{ api: ApiMock }>({
  api: async ({ page }, use) => { await use(await mockApi(page)); },
});
export { expect } from '@playwright/test';
