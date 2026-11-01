import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Identifies this build. The page compares it with version.json on the server
// to learn that a newer build has been deployed since the tab was opened.
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || String(Date.now());

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    {
      name: 'emit-version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
      },
    },
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
