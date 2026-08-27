/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PUBLIC_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** LAN IPv4 of the dev machine, injected by vite.config.ts. */
declare const __LAN_HOST__: string;

/** Deployment revision or explicit VITE_APP_VERSION, injected at build time. */
declare const __APP_VERSION__: string;
