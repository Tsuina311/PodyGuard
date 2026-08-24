import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventService } from './events/event-service.js';
import { MemoryEventStore } from './events/memory-event-store.js';
import { createIdentityBoundary } from './identity/index.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function buildProductionApp() {
  const webRoot = await mkdtemp(join(tmpdir(), 'podyguard-web-'));
  temporaryRoots.push(webRoot);
  await writeFile(
    join(webRoot, 'index.html'),
    '<!doctype html><title>PodyGuard test shell</title>',
  );
  await writeFile(
    join(webRoot, 'manifest.webmanifest'),
    '{"name":"PodyGuard","display":"standalone"}',
  );
  await writeFile(join(webRoot, 'sw.js'), '/* test worker */');
  const identity = createIdentityBoundary({
    participantSessionSecret: 'test-secret',
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    isDev: false,
  });
  return buildApp({
    identity,
    events,
    logger: false,
    serveWeb: true,
    webRoot,
  });
}

describe('production web service', () => {
  it('serves the React shell for direct SPA routes', async () => {
    const app = await buildProductionApp();
    const response = await app.inject({
      method: 'GET',
      url: '/join/ABC123',
      headers: { accept: 'text/html' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('PodyGuard test shell');
    await app.close();
  });

  it('rewrites browser API requests without turning missing APIs into HTML', async () => {
    const app = await buildProductionApp();
    const event = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        name: 'Friday Commander',
        hostPin: '2468',
        tableCount: 2,
      },
    });
    expect(event.statusCode).toBe(201);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/not-a-route',
      headers: { accept: 'application/json' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
    await app.close();
  });

  /*
    Installing the app to a home screen only works if these two arrive as
    themselves. The SPA fallback answers anything it does not recognise with the
    shell, so a wrong static route would hand a browser HTML for its manifest
    and its worker, and the phone would quietly go on showing a URL bar.
  */
  it('serves the manifest and the service worker rather than the shell', async () => {
    const app = await buildProductionApp();

    const manifest = await app.inject({ url: '/manifest.webmanifest' });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.json()).toMatchObject({ display: 'standalone' });

    const worker = await app.inject({ url: '/sw.js' });
    expect(worker.statusCode).toBe(200);
    expect(worker.body).toContain('test worker');
    expect(worker.headers['content-type']).toContain('javascript');

    await app.close();
  });
});
