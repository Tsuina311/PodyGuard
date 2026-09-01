import { describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import type { PublicDisplayEventState } from '@podyguard/shared';
import { buildApp } from '../app.js';
import { DisplayService } from './display-service.js';
import { MemoryDisplayStore } from './memory-display-store.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

const SECRET = 'test-display-secret';

async function buildTestApp() {
  const identity = createIdentityBoundary({
    participantSessionSecret: SECRET,
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    isDev: true,
  });
  const displayStore = new MemoryDisplayStore();
  const displays = new DisplayService(displayStore, events, SECRET);
  return buildApp({
    identity,
    events,
    displays,
    displayStore,
    logger: false,
  });
}

async function createHostedEvent(app: Awaited<ReturnType<typeof buildTestApp>>) {
  const created = await app.inject({
    method: 'POST',
    url: '/events',
    payload: { name: 'Friday Magic', hostPin: '2468', tableCount: 4 },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json() as {
    event: { joinCode: string; id: string };
    hostToken: string;
  };
  return body;
}

describe('public display authorization', () => {
  it('pairs a display, serves sanitized state, and revokes access', async () => {
    const app = await buildTestApp();
    const { event, hostToken } = await createHostedEvent(app);

    const pair = await app.inject({ method: 'POST', url: '/displays/pair' });
    expect(pair.statusCode).toBe(201);
    const pairing = pair.json() as {
      sessionId: string;
      pairingCode: string;
    };

    const approve = await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { pairingCode: pairing.pairingCode, label: 'Main TV' },
    });
    expect(approve.statusCode).toBe(200);

    const claim = await app.inject({
      method: 'POST',
      url: `/displays/pair/${pairing.sessionId}/claim`,
    });
    expect(claim.statusCode).toBe(200);
    const { token } = claim.json() as { token: string };
    expect(token.startsWith('ds1.')).toBe(true);

    const reuseClaim = await app.inject({
      method: 'POST',
      url: `/displays/pair/${pairing.sessionId}/claim`,
    });
    expect(reuseClaim.statusCode).toBe(401);

    const state = await app.inject({
      method: 'GET',
      url: '/displays/state',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(state.statusCode).toBe(200);
    const payload = state.json() as { state: PublicDisplayEventState };
    expect(payload.state.event.name).toBe('Friday Magic');
    expect(payload.state.tables).toHaveLength(4);
    expect(JSON.stringify(payload.state)).not.toContain(hostToken);
    expect(JSON.stringify(payload.state)).not.toContain('sessionToken');
    expect(JSON.stringify(payload.state)).not.toMatch(/hs1\./);
    expect(JSON.stringify(payload.state)).not.toMatch(/ps1\./);
    expect(payload.state).not.toHaveProperty('participants');
    expect(payload.state.event).not.toHaveProperty('challengePack');

    await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/join`,
      payload: { displayName: 'Alex' },
    });

    const afterJoin = await app.inject({
      method: 'GET',
      url: '/displays/state',
      headers: { authorization: `Bearer ${token}` },
    });
    const after = afterJoin.json() as { state: PublicDisplayEventState };
    expect(JSON.stringify(after.state)).not.toContain('@');

    const displays = await app.inject({
      method: 'GET',
      url: `/events/${event.joinCode}/displays`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const list = displays.json() as {
      displays: Array<{ id: string; label: string }>;
    };
    expect(list.displays[0]?.label).toBe('Main TV');

    const revoke = await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/${list.displays[0]!.id}/revoke`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(revoke.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'GET',
      url: '/displays/state',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(denied.statusCode).toBe(401);

    await app.close();
  });

  it('rejects expired and cross-event pairing', async () => {
    const app = await buildTestApp();
    const a = await createHostedEvent(app);
    const b = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Other Night', hostPin: '1357', tableCount: 2 },
    });
    const other = b.json() as {
      event: { joinCode: string };
      hostToken: string;
    };

    const pair = await app.inject({ method: 'POST', url: '/displays/pair' });
    const pairing = pair.json() as { pairingCode: string; sessionId: string };

    const cross = await app.inject({
      method: 'POST',
      url: `/events/${other.event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${a.hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    expect(cross.statusCode).toBe(401);

    const badCode = await app.inject({
      method: 'POST',
      url: `/events/${a.event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${a.hostToken}` },
      payload: { pairingCode: '000 000' },
    });
    expect(badCode.statusCode).toBe(404);

    const ok = await app.inject({
      method: 'POST',
      url: `/events/${a.event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${a.hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    expect(ok.statusCode).toBe(200);

    const reuse = await app.inject({
      method: 'POST',
      url: `/events/${a.event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${a.hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    expect(reuse.statusCode).toBe(404);

    await app.close();
  });

  it('rate-limits pairing code guessing', async () => {
    const app = await buildTestApp();
    const { event, hostToken } = await createHostedEvent(app);
    const pair = await app.inject({ method: 'POST', url: '/displays/pair' });
    const pairing = pair.json() as { pairingCode: string };

    for (let i = 0; i < 20; i += 1) {
      const guess = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/displays/approve`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { pairingCode: `${String(100 + i).padStart(3, '0')} 000` },
      });
      expect(guess.statusCode).toBe(404);
    }
    const limited = await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    expect(limited.statusCode).toBe(429);

    await app.close();
  });

  it('sanitizes announcements as plain text', async () => {
    const app = await buildTestApp();
    const { event, hostToken } = await createHostedEvent(app);
    const pair = await app.inject({ method: 'POST', url: '/displays/pair' });
    const pairing = pair.json() as { pairingCode: string; sessionId: string };
    await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    const claim = await app.inject({
      method: 'POST',
      url: `/displays/pair/${pairing.sessionId}/claim`,
    });
    const { token } = claim.json() as { token: string };

    const announced = await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/announcements`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        message: 'ROUND 3 <script>alert(1)</script> POSTED',
        durationSeconds: 20,
      },
    });
    expect(announced.statusCode).toBe(200);
    const body = announced.json() as {
      announcement: { message: string };
    };
    expect(body.announcement.message).not.toContain('<');
    expect(body.announcement.message).not.toContain('>');
    expect(body.announcement.message).toContain('ROUND 3');

    const state = await app.inject({
      method: 'GET',
      url: '/displays/state',
      headers: { authorization: `Bearer ${token}` },
    });
    const payload = state.json() as { state: PublicDisplayEventState };
    expect(payload.state.announcement?.message).toBe(body.announcement.message);

    await app.close();
  });

  it('does not allow display tokens on host mutation routes', async () => {
    const app = await buildTestApp();
    const { event, hostToken } = await createHostedEvent(app);
    const pair = await app.inject({ method: 'POST', url: '/displays/pair' });
    const pairing = pair.json() as { pairingCode: string; sessionId: string };
    await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    const claim = await app.inject({
      method: 'POST',
      url: `/displays/pair/${pairing.sessionId}/claim`,
    });
    const { token } = claim.json() as { token: string };

    const mutate = await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/match`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mutate.statusCode).toBe(401);

    await app.close();
  });
});

describe('public display realtime', () => {
  it('pushes display snapshots and stops after revoke', async () => {
    const app = await buildTestApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const url = `http://127.0.0.1:${String(port)}`;

    const { event, hostToken } = await createHostedEvent(app);
    const pair = await app.inject({ method: 'POST', url: '/displays/pair' });
    const pairing = pair.json() as { pairingCode: string; sessionId: string };
    await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/approve`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { pairingCode: pairing.pairingCode },
    });
    const claim = await app.inject({
      method: 'POST',
      url: `/displays/pair/${pairing.sessionId}/claim`,
    });
    const { token } = claim.json() as { token: string };

    const first = await waitForDisplaySnapshot(url, token, () => true);
    expect(first.event.name).toBe('Friday Magic');

    const list = await app.inject({
      method: 'GET',
      url: `/events/${event.joinCode}/displays`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const displays = list.json() as { displays: Array<{ id: string }> };
    await app.inject({
      method: 'POST',
      url: `/events/${event.joinCode}/displays/${displays.displays[0]!.id}/revoke`,
      headers: { authorization: `Bearer ${hostToken}` },
    });

    await expect(
      waitForDisplaySnapshot(url, token, () => true, 1500),
    ).rejects.toThrow(/unauthorized|timeout/i);

    await app.close();
  });
});

function waitForDisplaySnapshot(
  url: string,
  token: string,
  match: (state: PublicDisplayEventState) => boolean,
  timeoutMs = 4000,
): Promise<PublicDisplayEventState> {
  const socket = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('snapshot timeout'));
    }, timeoutMs);
    socket.on('connect', () => {
      socket.emit('watch-display', token);
    });
    socket.on('display-snapshot', (state: PublicDisplayEventState) => {
      if (!match(state)) {
        return;
      }
      clearTimeout(timer);
      socket.close();
      resolve(state);
    });
    socket.on('display-unauthorized', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('unauthorized'));
    });
  });
}
