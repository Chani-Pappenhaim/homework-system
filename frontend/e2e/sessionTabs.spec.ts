import { test, expect, type BrowserContext } from '@playwright/test';
import { teacher } from './fixtures';

const student = { ...teacher, id: 's1', name: 'רבקה לוי', email: 'student@example.com', role: 'STUDENT' };

const tokenFor = (userId: string) => {
  const b64url = (s: string) => Buffer.from(s).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ userId, iat: now, exp: now + 900 }))}.sig`;
};

/**
 * The backend for a whole browser: one refresh cookie, shared by every tab,
 * that belongs to whoever signed in last.
 */
async function mockBrowserSession(context: BrowserContext, signedIn: typeof teacher | null) {
  const session = { owner: signedIn };
  await context.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const req = route.request();
    const path = `${req.method()} ${new URL(req.url()).pathname.slice('/api'.length)}`;
    const reply = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    switch (path) {
      case 'POST /auth/refresh':
        return session.owner
          ? reply(200, { success: true, data: { accessToken: tokenFor(session.owner.id) } })
          : reply(401, { success: false, error: 'No session' });
      case 'GET /auth/me':
        return reply(200, { success: true, data: { user: session.owner } });
      case 'POST /auth/login': {
        const user = req.postDataJSON().email === student.email ? student : teacher;
        session.owner = user;
        return reply(200, { success: true, data: { user, accessToken: tokenFor(user.id) } });
      }
      case 'POST /auth/logout':
        session.owner = null;
        return reply(200, { success: true, data: null });
      default:
        return reply(200, { success: true, data: {} });
    }
  });
  return session;
}

// Row 8 of the client's sheet: a teacher tab and a student tab in one browser -
// at some point one of them quietly became the other user.
test.describe('two tabs of one browser', () => {
  test('signing in as someone else in one tab moves the other tab to her, with a notice', async ({ context }) => {
    const session = await mockBrowserSession(context, teacher);
    const teacherTab = await context.newPage();
    await teacherTab.goto('/teacher');
    await expect(teacherTab.getByRole('heading', { name: 'שלום, עדי!' })).toBeVisible();

    // The second tab signs in as a student (her cookie replaces the teacher's).
    session.owner = null;
    const studentTab = await context.newPage();
    await studentTab.goto('/login');
    await studentTab.getByLabel('כתובת אימייל').fill(student.email);
    await studentTab.getByLabel('סיסמא', { exact: true }).fill('e2e-test-pass');
    await studentTab.getByRole('button', { name: /כניסה/ }).click();
    await expect(studentTab).toHaveURL(/\/student/);

    await expect(teacherTab).toHaveURL(/\/student/);
    await expect(teacherTab.getByText('בלשונית אחרת נכנסו לחשבון אחר')).toBeVisible();
  });

  test('signing out in one tab signs out the other', async ({ context }) => {
    await mockBrowserSession(context, teacher);
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto('/teacher');
    await second.goto('/teacher');
    await expect(second.getByRole('heading', { name: 'שלום, עדי!' })).toBeVisible();

    await first.getByTitle('יציאה').click();
    await expect(first).toHaveURL(/\/login$/);

    await expect(second).toHaveURL(/\/login$/);
    await expect(second.getByText('יצאת מהחשבון בלשונית אחרת')).toBeVisible();
  });
});
