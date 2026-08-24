import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('health endpoint', () => {
  it('responds with service metadata', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json() as {
      service: string;
      database: string;
      ok: boolean;
    };
    expect(response.statusCode).toBe(body.ok ? 200 : 503);
    expect(body.service).toBe('podyguard-server');
    expect(['up', 'down']).toContain(body.database);
    expect(app.identity.hostAuth).toBeDefined();
    expect(app.identity.participantSessions).toBeDefined();
    expect(app.identity.hostEventSessions).toBeDefined();
    expect(app.identity.authorization).toBeDefined();

    await app.close();
  });
});
