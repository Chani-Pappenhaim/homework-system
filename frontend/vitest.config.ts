import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    // e2e/ holds the Playwright specs; they run in a real browser via `npm run test:e2e`.
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    // These tests finish in ~1s each when run alone, but spinning up 30 jsdom
    // environments in parallel starves them well past the 5s default and a
    // varying handful times out each run. Nothing here asserts on timing, so a
    // wider bound removes the flake without weakening any assertion.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/types/**', '**/*.d.ts'],
    },
  },
});
