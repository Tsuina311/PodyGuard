import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

afterEach(() => vi.unstubAllEnvs());
describe('read-only administrator access', () => {
  it('fails closed, rejects account tokens, and only exposes cross-account data to the admin credential', async () => {
    const store = new MemoryEventStore();
    const identity = createIdentityBoundary({ participantSessionSecret: 'test-admin-secret' });
    const events = new EventService(store, identity, { isDev: true });
    const owner = await store.upsertUserAccount({ authUserId: 'owner', displayName: 'Owner' });
    const other = await store.upsertUserAccount({ authUserId: 'other', displayName: 'Other' });
    const first = await store.insertPlaygroup({ ownerUserId: owner.id, name: 'First group' });
    await store.insertPlaygroup({ ownerUserId: other.id, name: 'Second group' });
    const app = await buildApp({ identity, events, logger: false, serveWeb: false });
    try {
      vi.stubEnv('ADMIN_ACCESS_TOKEN', '');
      expect((await app.inject('/admin/playgroups')).statusCode).toBe(503);
      vi.stubEnv('ADMIN_ACCESS_TOKEN', 'a-very-long-test-admin-credential-123456789');
      expect((await app.inject('/admin/playgroups')).statusCode).toBe(403);
      const login = await events.startEmailAuth({ email: 'ordinary@example.com', displayName: 'Ordinary user' });
      const account = await events.verifyEmailAuth({ email: 'ordinary@example.com', code: login.devCode! });
      expect((await app.inject({ url: '/admin/playgroups', headers: { authorization: `Bearer ${account.token}` } })).statusCode).toBe(403);
      const headers = { authorization: 'Bearer a-very-long-test-admin-credential-123456789' };
      const listed = await app.inject({ url: '/admin/playgroups', headers });
      expect(listed.statusCode).toBe(200);
      expect(listed.headers['cache-control']).toBe('no-store');
      expect(listed.json().playgroups).toHaveLength(2);
      expect((await app.inject({ url: `/admin/playgroups/${first.id}`, headers })).json().overview.playgroup.name).toBe('First group');
      expect((await app.inject({ url: '/admin/playgroups/missing', headers })).statusCode).toBe(404);
      expect((await app.inject({ url: '/admin/playgroups?offset=-1', headers })).statusCode).toBe(400);
      expect((await app.inject({ method: 'DELETE', url: `/admin/playgroups/${first.id}`, headers })).statusCode).toBe(404);
      expect((await app.inject('/test/demo')).statusCode).toBe(404);
    } finally { await app.close(); }
  });
});
