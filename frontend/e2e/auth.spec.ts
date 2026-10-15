import { test, expect, ok, fail, teacher } from './fixtures';

test.describe('signing in', () => {
  test('the root sends a signed-out visitor to the login page', async ({ page, api }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('כתובת אימייל')).toBeVisible();
    expect(api.calls).toContain('POST /auth/refresh');
  });

  test('a teacher who signs in lands on her home page', async ({ page, api }) => {
    api.on('POST', '/auth/login', ok({ user: teacher, accessToken: 'e2e-token' }));
    await page.goto('/login');
    await page.getByLabel('כתובת אימייל').fill(teacher.email);
    await page.getByLabel('סיסמא', { exact: true }).fill('e2e-test-pass');
    await page.getByRole('button', { name: /כניסה/ }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByRole('heading', { name: 'שלום, עדי!' })).toBeVisible();
  });

  test('wrong details show the server message and stay on the login page', async ({ page, api }) => {
    api.on('POST', '/auth/login', fail(401, 'אימייל או סיסמא שגויים'));
    await page.goto('/login');
    await page.getByLabel('כתובת אימייל').fill('nobody@example.com');
    await page.getByLabel('סיסמא', { exact: true }).fill('e2e-wrong-pass');
    await page.getByRole('button', { name: /כניסה/ }).click();
    await expect(page.getByText('אימייל או סיסמא שגויים')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a signed-out visitor is kept out of the teacher area', async ({ page }) => {
    await page.goto('/teacher/courses');
    await expect(page).toHaveURL(/\/login$/);
  });
});

// Row 21 of the client's sheet: the reset link from the email bounced to the
// login page when opened signed out, before the new password could be set.
test.describe('links from emails, opened signed out', () => {
  test('the reset-password page stays put and sets the new password', async ({ page, api }) => {
    let body: unknown;
    api.on('POST', '/auth/reset-password', (route) => {
      body = route.request().postDataJSON();
      return ok({})(route);
    });
    await page.goto('/reset-password?token=abc123');
    await expect(page.getByRole('heading', { name: 'בחירת סיסמא חדשה' })).toBeVisible();
    await page.waitForTimeout(500); // let the session bootstrap (refresh -> 401) settle
    await expect(page).toHaveURL(/\/reset-password\?token=abc123$/);

    await page.getByLabel('סיסמא חדשה', { exact: true }).fill('e2e-new-pass');
    await page.getByLabel('אימות סיסמא חדשה').fill('e2e-new-pass');
    await page.getByRole('button', { name: 'עדכון סיסמא' }).click();
    await expect(page.getByText('הסיסמא עודכנה בהצלחה')).toBeVisible();
    expect(body).toEqual({ token: 'abc123', newPassword: 'e2e-new-pass' });
    await expect(page).toHaveURL(/\/login$/, { timeout: 5000 });
  });

  test('an expired reset link shows why instead of bouncing to login', async ({ page, api }) => {
    api.on('POST', '/auth/reset-password', fail(401, 'הקישור אינו תקין או שפג תוקפו'));
    await page.goto('/reset-password?token=old');
    await page.getByLabel('סיסמא חדשה', { exact: true }).fill('e2e-new-pass');
    await page.getByLabel('אימות סיסמא חדשה').fill('e2e-new-pass');
    await page.getByRole('button', { name: 'עדכון סיסמא' }).click();
    await expect(page.getByText('הקישור אינו תקין או שפג תוקפו')).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password/);
  });

  test('mismatched passwords are caught before anything is sent', async ({ page, api }) => {
    await page.goto('/reset-password?token=abc123');
    await page.getByLabel('סיסמא חדשה', { exact: true }).fill('e2e-new-pass');
    await page.getByLabel('אימות סיסמא חדשה').fill('e2e-other-pass');
    await page.getByRole('button', { name: 'עדכון סיסמא' }).click();
    await expect(page.getByText('הסיסמאות אינן תואמות')).toBeVisible();
    expect(api.calls).not.toContain('POST /auth/reset-password');
  });

  test('the verify-email link confirms the address', async ({ page, api }) => {
    api.on('POST', '/auth/verify-email', ok({}));
    await page.goto('/verify-email?token=v1');
    await expect(page.getByText('הכתובת אומתה!', { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/verify-email/);
  });

  test('a used verify-email link explains itself and stays on the page', async ({ page, api }) => {
    api.on('POST', '/auth/verify-email', fail(401, 'הקישור אינו תקין או שכבר נעשה בו שימוש'));
    await page.goto('/verify-email?token=used');
    await expect(page.getByText('הקישור אינו תקין או שכבר נעשה בו שימוש')).toBeVisible();
    await expect(page).toHaveURL(/\/verify-email/);
  });

  test('forgot-password confirms without saying whether the address exists', async ({ page, api }) => {
    let body: unknown;
    api.on('POST', '/auth/forgot-password', (route) => {
      body = route.request().postDataJSON();
      return ok({})(route);
    });
    await page.goto('/login');
    await page.getByRole('link', { name: 'שכחתי סיסמא' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel('כתובת אימייל').fill('someone@example.com');
    await page.getByRole('button', { name: /שליחת קישור/ }).click();
    await expect(page.getByText(/אם כתובת המייל הזו רשומה במערכת/)).toBeVisible();
    expect(body).toEqual({ email: 'someone@example.com' });
  });
});
