/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the backend API (e.g. https://api.example.com). Empty in local
  // dev, where requests go to the same origin and are proxied to the backend.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
