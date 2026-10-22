import { test, expect, ok, signIn } from './fixtures';

const course = {
  id: 'c1', name: 'React מתקדם', hidden: false, groupId: 'g1', groupName: 'יב 1',
  lessonCount: 4, createdAt: '2026-09-01T00:00:00.000Z',
};

test.beforeEach(({ api }) => {
  signIn(api);
  api.on('GET', '/groups', ok({ groups: [{ id: 'g1', name: 'יב 1' }] }));
  api.on('GET', '/courses', ok({ courses: [course] }));
  api.on('GET', '/grades/pending', ok({ count: 3 }));
});

test('a restored session opens the teacher home with her numbers', async ({ page }) => {
  await page.goto('/teacher');
  await expect(page.getByRole('heading', { name: 'שלום, עדי!' })).toBeVisible();
  await expect(page.getByText('3 הגשות ממתינות')).toBeVisible();
});

test('a signed-in teacher visiting /login goes straight in', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/teacher$/);
});

test('Ctrl+K focuses the search box, also on a Hebrew keyboard layout', async ({ page }) => {
  await page.goto('/teacher');
  const search = page.getByPlaceholder('חיפוש תלמידה או מטלה');
  await expect(search).toBeVisible();
  await expect(page.getByText('Ctrl+K')).toBeVisible();

  await page.keyboard.press('Control+KeyK');
  await expect(search).toBeFocused();

  await search.blur();
  // On a Hebrew layout the K key types 'ל': same physical key, different e.key.
  await page.evaluate(() => window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ל', code: 'KeyK', ctrlKey: true, bubbles: true }),
  ));
  await expect(search).toBeFocused();
});

test('searching finds a student and opens her page', async ({ page, api }) => {
  api.on('GET', '/students', ok({ students: [{ id: 's1', name: 'דנה כהן', email: 'dana@example.com', groupNames: ['יב 1'] }] }));
  await page.goto('/teacher');
  await page.getByPlaceholder('חיפוש תלמידה או מטלה').fill('דנה');
  const result = page.getByRole('button', { name: /דנה כהן/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/teacher\/students\/s1$/);
});

test('typing a search on another page keeps going past the first letter, and the box empties on leaving the results', async ({ page, api }) => {
  api.on('GET', '/students', ok({ students: [{ id: 's1', name: 'דנה כהן', email: 'dana@example.com', groupNames: ['יב 1'] }] }));
  await page.goto('/teacher/courses');
  await expect(page.getByText('React מתקדם')).toBeVisible();
  const search = page.getByPlaceholder('חיפוש תלמידה או מטלה');
  await page.keyboard.press('Control+KeyK');
  // Key by key, as a person types: the first letter moves to the dashboard.
  await search.pressSequentially('דנה');
  await expect(page).toHaveURL(/\/teacher\?q=%D7%93%D7%A0%D7%94$/);
  await expect(search).toHaveValue('דנה');
  await expect(search).toBeFocused();

  await page.getByRole('button', { name: /דנה כהן/ }).click();
  await expect(page).toHaveURL(/\/teacher\/students\/s1$/);
  await expect(search).toHaveValue('');
});

test('the search terms stay in the address, so coming back shows the same results', async ({ page, api }) => {
  api.on('GET', '/students', ok({ students: [{ id: 's1', name: 'דנה כהן', email: 'dana@example.com', groupNames: ['יב 1'] }] }));
  await page.goto('/teacher');
  await page.getByPlaceholder('חיפוש תלמידה או מטלה').fill('דנה');
  await page.getByRole('button', { name: /דנה כהן/ }).click();
  await expect(page).toHaveURL(/\/teacher\/students\/s1$/);

  await page.goBack();
  await expect(page.getByPlaceholder('חיפוש תלמידה או מטלה')).toHaveValue('דנה');
  await expect(page.getByRole('button', { name: /דנה כהן/ })).toBeVisible();
});

test('the courses list shows each course and opens it', async ({ page }) => {
  await page.goto('/teacher/courses');
  await expect(page.getByText('React מתקדם')).toBeVisible();
  await expect(page.getByText('4 שיעורים')).toBeVisible();
  await page.getByRole('button', { name: /פתח קורס/ }).click();
  await expect(page).toHaveURL(/\/teacher\/courses\//);
});

test('the students page finds students entered twice and deletes one from the list', async ({ page, api }) => {
  const overviewRow = (id: string, name: string, email: string) => ({
    id, name, email, githubUsername: null, groupNames: ['יב 1'],
    assignments: { total: 0, submitted: 0, late: 0, missing: 0 },
    averageContentScore: null, attendance: { present: 0, absent: 0, partial: 0, rate: null }, unreadMessages: 0,
  });
  api.on('GET', '/students/overview', ok({ students: [
    overviewRow('s1', 'דנה כהן', 'dana@example.com'),
    overviewRow('s2', 'מירי לוי', 'miri@example.com'),
    overviewRow('s3', 'דנה כהן', 'dana2@example.com'),
  ] }));
  api.on('DELETE', '/students/s3', ok({}));
  await page.goto('/teacher/students');

  await page.getByLabel('רק תלמידות כפולות (לפי שם)').check();
  await expect(page).toHaveURL(/duplicates=1/);
  await expect(page.getByText('מירי לוי')).toHaveCount(0);
  await expect(page.getByText('dana2@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'מחיקת החשבון של דנה כהן' }).last().click();
  await page.getByRole('button', { name: 'מחיקה לצמיתות' }).click();
  await expect(page.getByText('חשבון התלמידה נמחק')).toBeVisible();
  expect(api.calls).toContain('DELETE /students/s3');
});
