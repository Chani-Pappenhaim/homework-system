import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: the real app in a real browser, against vite dev with the
 * backend mocked per test (e2e/fixtures.ts), so they need no Docker or DB.
 *
 * Uses the installed Chrome rather than a downloaded Playwright browser (the
 * network here blocks Playwright's browser CDN). PW_CHANNEL=msedge switches it.
 */
const PORT = 5179;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? 'chrome',
    locale: 'he-IL',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // VITE_API_URL unset: the app calls same-origin /api, which the tests intercept.
    env: { VITE_API_URL: '' },
  },
});
