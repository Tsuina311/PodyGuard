#!/usr/bin/env node
/**
 * Phone-friendly local web server.
 *
 * Keep this running while you edit. Vite hot-reloads the phone on each save
 * (HMR is bound to the LAN IP in vite.config.ts). Same Wi‑Fi required.
 *
 *   yarn dev:phone
 *   yarn dev:phone --with-api   # also starts the API on :3001
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { findFreeDevPort } from './free-dev-port.mjs';

const preferred = Number(process.env.PORT ?? 5173);
const withApi = process.argv.includes('--with-api');

function lanHost() {
  const candidates = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
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
const port = await findFreeDevPort(
  Number.isFinite(preferred) && preferred > 0 ? preferred : 5173,
);
if (port !== preferred) {
  console.log(`  Port ${String(preferred)} busy — using ${String(port)}`);
}

const phoneUrl = lan
  ? `http://${lan}:${String(port)}/`
  : `http://localhost:${String(port)}/`;

console.log('');
console.log('  PodyGuard phone dev');
console.log(`  Open on your phone:  ${phoneUrl}`);
if (!lan) {
  console.log('  (No LAN IPv4 found — phone may not reach this machine.)');
}
console.log('  Leave this running; saves hot-reload on the phone.');
console.log('');

const children = [];

function run(command, args, label) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      PORT: String(port),
    },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${label}] exited ${String(code)}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (withApi) {
  run('yarn', ['workspace', '@podyguard/server', 'dev'], 'api');
}
run(
  'yarn',
  ['workspace', '@podyguard/web', 'dev', '--port', String(port)],
  'web',
);
