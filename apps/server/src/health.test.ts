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
      buildVersion: string;
      serverStartedAt: string;
      uptimeSeconds: number;
      timestamp: string;
    };
    expect(response.statusCode).toBe(body.ok ? 200 : 503);
    expect(body.service).toBe('podyguard-server');
    expect(['up', 'down']).toContain(body.database);
    expect(body.buildVersion.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(body.serverStartedAt))).toBe(false);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(
      /DATABASE_URL|PARTICIPANT_SESSION|password|secret/i,
    );
    expect(app.identity.hostAuth).toBeDefined();
    expect(app.identity.participantSessions).toBeDefined();
    expect(app.identity.hostEventSessions).toBeDefined();
    expect(app.identity.authorization).toBeDefined();

    await app.close();
  });

  it('allows memory stacks to report healthy without Postgres', async () => {
    const app = await buildApp({
      logger: false,
      checkDatabase: async () => true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    const body = response.json() as { ok: boolean; database: string };

    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.database).toBe('up');

    await app.close();
  });
});
