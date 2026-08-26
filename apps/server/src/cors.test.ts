import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('cross-origin browser access', () => {
  it('reflects the always-on site origin so GitHub Pages can call the API', async () => {
    const app = await buildApp({ logger: false });
    const origin = 'https://tsuina311.github.io';

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin },
    });

    expect(response.headers['access-control-allow-origin']).toBe(origin);
    await app.close();
  });
});
