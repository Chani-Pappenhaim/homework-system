import { chromium, type FullConfig } from '@playwright/test';

/**
 * Loads the app once before the tests run. On a cold dev server vite compiles
 * and optimizes deps on the first visit and then forces a full reload, which
 * aborts whatever page.goto the parallel tests are in the middle of.
 */
export default async function warmup(config: FullConfig) {
  const { baseURL, channel } = config.projects[0].use;
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' }));
  for (let i = 0; i < 2; i++) {
    await page.goto(`${baseURL}/login`, { timeout: 120_000 }).catch(() => {});
    await page.getByRole('button', { name: 'כניסה למערכת' }).waitFor({ timeout: 120_000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }
  await browser.close();
}
