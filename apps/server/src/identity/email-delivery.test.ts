import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from './index.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('production email login delivers its code without exposing it, and rejects unverified provider identities', async () => {
  const store = new MemoryEventStore();
  const identity = createIdentityBoundary({ participantSessionSecret: 'production-email-test-secret' });
  const events = new EventService(store, identity, { isDev: false });
  const app = await buildApp({ events, identity, logger: false, serveWeb: false });
  try {
    vi.stubEnv('RESEND_API_KEY', ''); vi.stubEnv('AUTH_EMAIL_FROM', '');
    const payload = { email: 'owner@example.com', displayName: 'Owner' };
    expect((await app.inject({ method: 'POST', url: '/auth/email/start', payload })).statusCode).toBe(503);
    vi.stubEnv('RESEND_API_KEY', 'test-key'); vi.stubEnv('AUTH_EMAIL_FROM', 'PodyGuard <signin@example.com>');
    let deliveredCode = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      const body = JSON.parse(init.body as string);
      expect(body.to).toEqual(['owner@example.com']);
      deliveredCode = body.text.match(/\b\d{6}\b/)[0];
      return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 });
    }));
    const started = await app.inject({ method: 'POST', url: '/auth/email/start', payload });
    expect(started.statusCode).toBe(200);
    expect(started.json()).not.toHaveProperty('devCode');
    expect(started.body).not.toContain(deliveredCode);
    const verified = await app.inject({ method: 'POST', url: '/auth/email/verify', payload: { email: payload.email, code: deliveredCode } });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().account.email).toBe(payload.email);
    expect((await app.inject({ method: 'POST', url: '/auth/neon', payload: { neonUserId: 'unverified', email: payload.email } })).statusCode).toBe(401);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private upstream failure', { status: 500 })));
    const failed = await app.inject({ method: 'POST', url: '/auth/email/start', payload });
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('private upstream failure');
    expect(failed.json()).not.toHaveProperty('devCode');
  } finally { await app.close(); }
});
