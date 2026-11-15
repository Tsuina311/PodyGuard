import { expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';
it('discovers a shared tracker only for the same playing table and refuses a second main publisher', async () => {
  const identity = createIdentityBoundary({
    participantSessionSecret: 'table-context-test',
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    isDev: true,
  });
  const app = await buildApp({ identity, events, logger: false });
  try {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/events',
        payload: { name: 'Shared tables', hostPin: '2468', tableCount: 2 },
      })
    ).json();
    const code = created.event.joinCode;
    const host = { authorization: `Bearer ${created.hostToken}` };
    const seats: Array<{ id: string; token: string }> = [];
    for (let n = 0; n < 8; n++) {
      const joined = (
        await app.inject({
          method: 'POST',
          url: `/events/${code}/join`,
          payload: { displayName: `Friend ${n}` },
        })
      ).json();
      seats.push({ id: joined.participant.id, token: joined.token });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/events/${code}/ready`,
            headers: { authorization: `Bearer ${joined.token}` },
            payload: { ready: true },
          })
        ).statusCode,
      ).toBe(200);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/events/${code}/match`,
          headers: host,
        })
      ).statusCode,
    ).toBe(200);
    const { tables } = (
      await app.inject({ method: 'GET', url: `/events/${code}/tables` })
    ).json();
    for (const table of tables)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/events/${code}/tables/${table.id}/start`,
            headers: host,
          })
        ).statusCode,
      ).toBe(200);
    const { participants } = (
      await app.inject({ method: 'GET', url: `/events/${code}/participants` })
    ).json();
    const main = seats[0]!;
    const label = participants.find(
      (p: { id: string }) => p.id === main.id,
    ).tableLabel;
    const own = seats.find(
      (s) =>
        s.id !== main.id &&
        participants.find((p: { id: string }) => p.id === s.id).tableLabel ===
          label,
    )!;
    const other = seats.find(
      (s) =>
        participants.find((p: { id: string }) => p.id === s.id).tableLabel !==
        label,
    )!;
    const payload = {
      eventCode: code,
      format: 'Commander',
      startedAt: null,
      paused: false,
      winnerId: null,
      players: [
        {
          id: 'a',
          name: 'Ada',
          life: 40,
          poison: 0,
          commanders: [],
          commanderDamage: {},
        },
        {
          id: 'b',
          name: 'Bea',
          life: 40,
          poison: 0,
          commanders: [],
          commanderDamage: {},
        },
      ],
    };
    expect(
      (await app.inject({ method: 'POST', url: '/tracker-shares', payload }))
        .statusCode,
    ).toBe(403);
    const shareResponse = await app.inject({
      method: 'POST',
      url: '/tracker-shares',
      headers: { authorization: `Bearer ${main.token}` },
      payload,
    });
    expect(shareResponse.statusCode).toBe(200);
    const share = shareResponse.json();
    const ownView = (
      await app.inject({
        method: 'GET',
        url: `/events/${code}/table-view`,
        headers: { authorization: `Bearer ${own.token}` },
      })
    ).json();
    expect(ownView.view).toEqual({ id: share.id, readToken: share.readToken });
    expect(JSON.stringify(ownView)).not.toContain(share.writeToken);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/events/${code}/table-view`,
          headers: { authorization: `Bearer ${other.token}` },
        })
      ).json().view,
    ).toBeNull();
    expect(
      (await app.inject({ method: 'GET', url: `/events/${code}/table-view` }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tracker-shares',
          headers: { authorization: `Bearer ${own.token}` },
          payload,
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await app.close();
  }
});
