import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The join QR has to point at an address a phone can reach, so we hand the app
 * this machine's LAN IPv4 and skip VPN/virtual tunnels.
 */
function lanHost(): string {
  const candidates: Array<{ address: string; score: number }> = [];
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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __LAN_HOST__: JSON.stringify(lanHost()),
  },
  server: {
    host: true,
    port: 5173,
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
});
