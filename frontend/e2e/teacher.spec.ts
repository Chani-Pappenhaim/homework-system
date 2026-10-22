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
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(search).toHaveValue('דנה');
  await expect(search).toBeFocused();

  await page.getByRole('button', { name: /דנה כהן/ }).click();
  await expect(page).toHaveURL(/\/teacher\/students\/s1$/);
  await expect(search).toHaveValue('');
});

test('the courses list shows each course and opens it', async ({ page }) => {
  await page.goto('/teacher/courses');
  await expect(page.getByText('React מתקדם')).toBeVisible();
  await expect(page.getByText('4 שיעורים')).toBeVisible();
  await page.getByRole('button', { name: /פתח קורס/ }).click();
  await expect(page).toHaveURL(/\/teacher\/courses\//);
});
