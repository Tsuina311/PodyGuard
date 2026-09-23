import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { findFreeDevPort } from '../../scripts/free-dev-port.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Human-facing release version from the repo-root VERSION file.
 * Bump patch on ordinary commits; minor/major only for irreversible global changes.
 */
function releaseVersion(): string {
  const fromEnv = process.env.VITE_APP_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return readFileSync(resolve(repoRoot, 'VERSION'), 'utf8').trim();
  } catch {
    return '0.0.0-dev';
  }
}

function buildRevision(): string {
  return (
    process.env.GITHUB_SHA?.trim().slice(0, 7) ||
    process.env.RENDER_GIT_COMMIT?.trim().slice(0, 7) ||
    'dev'
  );
}

/**
 * The join QR has to point at an address a phone can reach, so we hand the app
 * this machine's LAN IPv4 and skip VPN/virtual tunnels.
 */
function lanHost(): string {
  const candidates: Array<{ address: string; score: number }> = [];
  let interfaces: ReturnType<typeof networkInterfaces>;
  try {
    interfaces = networkInterfaces();
  } catch {
    // Some CI/sandbox environments deny os.networkInterfaces(); LAN QR hint
    // is optional for production builds.
    return '';
  }
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) {
        continue;
      }
      let score = 0;
      if (/^en/.test(name)) {
        score += 4;
      }
      if (/^(utun|tun|tap|ipsec|awdl|llw|bridge|vmnet)/.test(name)) {
        score -= 5;
      }
      if (info.address.startsWith('192.168.')) {
        score += 2;
      } else if (info.address.startsWith('10.')) {
        score += 1;
      }
      candidates.push({ address: info.address, score });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.address ?? '';
}

const lan = lanHost();

function publicBase(): string {
  const fromEnv = process.env.VITE_BASE?.trim();
  if (fromEnv) {
    return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;
  }
  if (process.env.GITHUB_PAGES === 'true' && process.env.GITHUB_REPOSITORY) {
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1];
    return `/${repo}/`;
  }
  return '/';
}

function preferredDevPort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) {
    return 5173;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5173;
}

export default defineConfig(async () => {
  const preferred = preferredDevPort();
  const port = await findFreeDevPort(preferred);
  if (port !== preferred) {
    console.info(`[vite] port ${String(preferred)} is busy — using ${String(port)}`);
  }

  return {
    base: publicBase(),
    plugins: [react(), tailwindcss()],
    define: {
      __LAN_HOST__: JSON.stringify(lan),
      __APP_VERSION__: JSON.stringify(releaseVersion()),
      __APP_BUILD__: JSON.stringify(buildRevision()),
    },
    server: {
      host: true,
      port,
      // We already picked a free localhost port; still allow Vite to bump if a
      // race steals it between the probe and listen.
      strictPort: false,
      // Phones open via the LAN URL; without this, HMR websockets still target
      // localhost and the handset never sees file changes. Leave port unset so
      // it tracks the listening port if Vite has to bump again.
      ...(lan ? { hmr: { host: lan } } : {}),
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          ws: true,
        },
      },
    },
  };
});
