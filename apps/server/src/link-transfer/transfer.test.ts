import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';
import { LINK_TRANSFER_TTL_MS } from '@podyguard/shared';
import { LinkTransferService } from './service.js';
import { MemoryLinkTransferStore } from './store.js';

describe('one-use link transfer', () => {
  it('separates send/receive credentials and retains the first destination across retries and service instances', async () => {
    const store = new MemoryLinkTransferStore();
    const desktopServer = new LinkTransferService(store), phoneServer = new LinkTransferService(store);
    const session = await desktopServer.create();
    expect(session.sendToken).toMatch(/^[a-f0-9]{64}$/);
    expect(session.receiveToken).not.toBe(session.sendToken);
    const stored = JSON.stringify(await store.get(session.id));
    expect(stored).not.toContain(session.sendToken);
    expect(stored).not.toContain(session.receiveToken);
    await expect(phoneServer.receive(session.id, session.sendToken)).rejects.toMatchObject({ statusCode: 404 });
    await expect(phoneServer.send(session.id, session.receiveToken, '/tools')).rejects.toMatchObject({ statusCode: 404 });
    expect(await phoneServer.send(session.id, session.sendToken, '/display/event/ABCD12#round')).toEqual({ accepted: true });
    expect(await phoneServer.send(session.id, session.sendToken, '/tools')).toEqual({ accepted: false });
    for (let index = 0; index < 2; index++) expect(await desktopServer.receive(session.id, session.receiveToken)).toMatchObject({
      status: 'ACCEPTED', destination: '/display/event/ABCD12#round',
    });
  });

  it('arbitrates simultaneous submissions without overwriting the winner', async () => {
    const store = new MemoryLinkTransferStore();
    const first = new LinkTransferService(store), second = new LinkTransferService(store);
    const session = await first.create();
    const results = await Promise.all([
      first.send(session.id, session.sendToken, '/display/event/ABCD12'),
      second.send(session.id, session.sendToken, '/tools?q=swiss#rules'),
    ]);
    expect(results.filter(result => result.accepted)).toHaveLength(1);
    expect((await second.receive(session.id, session.receiveToken)).destination).toBe(results[0]!.accepted ? '/display/event/ABCD12' : '/tools?q=swiss#rules');
  });

  it('expires both capabilities, including a result already accepted', async () => {
    let now = new Date('2026-11-27T13:00:00Z');
    const service = new LinkTransferService(new MemoryLinkTransferStore(), () => now);
    const session = await service.create();
    await service.send(session.id, session.sendToken, '/tools');
    now = new Date(now.getTime() + LINK_TRANSFER_TTL_MS);
    await expect(service.receive(session.id, session.receiveToken)).rejects.toMatchObject({ statusCode: 410 });
    await expect(service.send(session.id, session.sendToken, '/tools')).rejects.toMatchObject({ statusCode: 410 });
  });
});

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
it('validates untrusted destinations at the HTTP boundary without consuming a valid QR', async () => {
  const identity = createIdentityBoundary({ participantSessionSecret: 'transfer-tests' });
  const app = await buildApp({ identity, events: new EventService(new MemoryEventStore(), identity), logger: false });
  apps.push(app);
  const created = await app.inject({ method: 'POST', url: '/link-transfers' });
  expect(created.statusCode).toBe(201);
  expect(created.headers['cache-control']).toBe('no-store');
  const session = created.json();
  for (const destination of ['https://evil.example/#/tools', '//evil.example', '/\\evil.example', 'javascript:alert(1)',
    '/%2f%2fevil.example', '/tools/../../account', '/account', '/match', '/limited', '/tools?redirect=https://evil.example']) {
    const response = await app.inject({ method: 'POST', url: `/link-transfers/${session.id}`,
      headers: { authorization: `Bearer ${session.sendToken}` }, payload: { destination } });
    expect(response.statusCode, destination).toBe(400);
  }
  expect((await app.inject({ method: 'GET', url: `/link-transfers/${session.id}` })).statusCode).toBe(404);
  const destination = `/watch/event-11111111-1111-4111-8111-111111111111?token=${'b'.repeat(64)}#totals`;
  const sent = await app.inject({ method: 'POST', url: `/link-transfers/${session.id}`,
    headers: { authorization: `Bearer ${session.sendToken}` }, payload: { destination } });
  expect(sent.json()).toEqual({ accepted: true });
  const received = await app.inject({ method: 'GET', url: `/link-transfers/${session.id}`,
    headers: { authorization: `Bearer ${session.receiveToken}` } });
  expect(received.json()).toMatchObject({ destination, status: 'ACCEPTED' });
  expect(received.headers['cache-control']).toBe('no-store');
});
