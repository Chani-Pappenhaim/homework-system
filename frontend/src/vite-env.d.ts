/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the backend API (e.g. https://api.example.com). Empty when
  // requests should go to the same origin.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
