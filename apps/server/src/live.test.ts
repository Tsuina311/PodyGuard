import { describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import type { EventSnapshot } from '@podyguard/shared';
import { buildApp } from './app.js';
import { EventService } from './events/event-service.js';
import { MemoryEventStore } from './events/memory-event-store.js';
import { createIdentityBoundary } from './identity/index.js';

async function buildTestApp() {
  const identity = createIdentityBoundary({
    participantSessionSecret: 'test-secret',
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    isDev: true,
  });
  return buildApp({ identity, events, logger: false });
}

function waitForSnapshot(
  url: string,
  joinCode: string,
  match: (snapshot: EventSnapshot) => boolean,
): Promise<EventSnapshot> {
  const socket = ioClient(url, { transports: ['websocket'] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('snapshot timeout'));
    }, 4000);
    socket.on('connect', () => {
      socket.emit('watch', joinCode);
    });
    socket.on('snapshot', (snapshot: EventSnapshot) => {
      if (!match(snapshot)) {
        return;
      }
      clearTimeout(timer);
      socket.close();
      resolve(snapshot);
    });
  });
}

describe('event live snapshots', () => {
  it('pushes a snapshot to watchers when a player joins', async () => {
    const app = await buildTestApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const url = `http://127.0.0.1:${String(port)}`;

    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 1 },
    });
    const joinCode = (
      created.json() as { event: { joinCode: string } }
    ).event.joinCode;

    const watching = waitForSnapshot(
      url,
      joinCode,
      (snapshot) =>
        snapshot.participants.some((row) => row.displayName === 'Alex'),
    );

    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Alex' },
    });

    const snapshot = await watching;
    expect(snapshot.participants[0]?.displayName).toBe('Alex');

    await app.close();
  });
});
