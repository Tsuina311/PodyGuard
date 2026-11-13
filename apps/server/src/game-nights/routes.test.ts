import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';
import { MemoryGameNightStore } from './store.js';

describe('game nights', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  let group: string;
  let outsider: string;
  let nights: MemoryGameNightStore;
  const input = () => ({
    name: 'Friday friends',
    startsAt: new Date(Date.now() + 86400_000).toISOString(),
    timeZone: 'Europe/Paris',
    location: 'Living room',
    seatTarget: 8,
    agreement: {
      pace: 'relaxed',
      durationMinutes: 90,
      notes: 'Discuss infinite combos first.',
    },
  });
  beforeEach(async () => {
    const identity = createIdentityBoundary({
      participantSessionSecret: 'night-test',
    });
    const events = new EventService(new MemoryEventStore(), identity, {
      isDev: true,
    });
    const login = async (email: string) => {
      const a = await events.startEmailAuth({ email });
      return events.verifyEmailAuth({ email, code: a.devCode! });
    };
    token = (await login('host@example.com')).token;
    outsider = (await login('other@example.com')).token;
    group = (await events.createPlaygroup(token, { name: 'Friends' })).id;
    nights = new MemoryGameNightStore();
    app = await buildApp({
      events,
      identity,
      gameNightStore: nights,
      logger: false,
      serveWeb: false,
    });
  });
  afterEach(async () => app.close());
  const headers = () => ({ authorization: `Bearer ${token}` });
  async function create() {
    const r = await app.inject({
      method: 'POST',
      url: `/playgroups/${group}/nights`,
      headers: headers(),
      payload: input(),
    });
    expect(r.statusCode).toBe(201);
    return r.json().night;
  }
  it('allows only owners to create and list nights', async () => {
    for (const authorization of ['', `Bearer ${outsider}`]) {
      const r = await app.inject({
        method: 'POST',
        url: `/playgroups/${group}/nights`,
        headers: { authorization },
        payload: input(),
      });
      expect([401, 403]).toContain(r.statusCode);
    }
    const night = await create();
    const list = await app.inject({
      url: `/playgroups/${group}/nights`,
      headers: headers(),
    });
    expect(list.json().nights[0].id).toBe(night.id);
  });
  it('updates an RSVP by its private response key without exposing keys in the invitation', async () => {
    const night = await create();
    for (const response of ['yes', 'maybe', 'no']) {
      const r = await app.inject({
        method: 'POST',
        url: `/nights/${night.id}/rsvp`,
        payload: { displayName: 'Ada', response, rsvpToken: 'a'.repeat(32) },
      });
      expect(r.statusCode).toBe(200);
    }
    const r = await app.inject(`/nights/${night.id}`);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json().responses).toEqual([
      { displayName: 'Ada', response: 'no' },
    ]);
    expect(r.body).not.toContain('token');
  });
  it.each([
    { seatTarget: 101 },
    { startsAt: '2020-01-01T00:00:00Z' },
    { startsAt: '2027-01-01T20:00' },
    { timeZone: 'unknown' },
    { agreement: { notes: 1 } },
  ])('rejects invalid planning input %j', async (patch) => {
    const r = await app.inject({
      method: 'POST',
      url: `/playgroups/${group}/nights`,
      headers: headers(),
      payload: { ...input(), ...patch },
    });
    expect(r.statusCode).toBe(400);
  });
  it('cancels an invitation and rejects late responses and starts', async () => {
    const night = await create();
    const denied = await app.inject({
      method: 'POST',
      url: `/nights/${night.id}/cancel`,
      headers: { authorization: `Bearer ${outsider}` },
    });
    expect(denied.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/nights/${night.id}/cancel`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(200);
    for (const action of ['rsvp', 'start'])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/nights/${night.id}/${action}`,
            headers: headers(),
            payload: {
              displayName: 'Ada',
              response: 'yes',
              rsvpToken: 'b'.repeat(32),
              hostPin: '2468',
            },
          })
        ).statusCode,
      ).toBe(409);
    expect((await app.inject(`/nights/${night.id}/calendar`)).body).toContain(
      'STATUS:CANCELLED',
    );
  });
  it('starts exactly one normal event under concurrent requests, carries the agreement, and never readies RSVPs', async () => {
    const night = await create();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/nights/${night.id}/rsvp`,
          payload: {
            displayName: 'Ada',
            response: 'yes',
            rsvpToken: 'c'.repeat(32),
          },
        })
      ).statusCode,
    ).toBe(200);
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: `/nights/${night.id}/start`,
          headers: headers(),
          payload: { hostPin: '2468' },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    for (const response of results) {
      expect(response.json().hostToken).toMatch(/^hs1\./);
      expect(response.json().hostToken).not.toBe(token);
    }
    const event = results[0]!.json().event;
    expect(results[1]!.json().event.id).toBe(event.id);
    expect(event.pregameAgreement).toEqual(input().agreement);
    expect(
      (await app.inject(`/events/${event.joinCode}`)).json().pregameAgreement,
    ).toEqual(input().agreement);
    expect(
      (await app.inject(`/events/${event.joinCode}/participants`)).json(),
    ).toEqual({ participants: [] });
  });
  it('recovers the same event after a failed invitation-link save', async () => {
    const night = await create();
    vi.spyOn(nights, 'update').mockRejectedValueOnce(
      new Error('link save interrupted'),
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/nights/${night.id}/start`,
          headers: headers(),
          payload: { hostPin: '2468' },
        })
      ).statusCode,
    ).toBe(500);
    const recovered = await app.events.findGameNightEvent(
      group,
      night.id,
      token,
    );
    expect(recovered).toBeDefined();
    const retry = await app.inject({
      method: 'POST',
      url: `/nights/${night.id}/start`,
      headers: headers(),
      payload: { hostPin: '2468' },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().hostToken).toMatch(/^hs1\./);
    expect(retry.json().event.id).toBe(recovered!.id);
  });
  it('rejects another owner starting a night and malformed responses', async () => {
    const night = await create();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/nights/${night.id}/start`,
          headers: { authorization: `Bearer ${outsider}` },
          payload: { hostPin: '2468' },
        })
      ).statusCode,
    ).toBe(403);
    for (const response of ['invalid', ['yes'], null]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/nights/${night.id}/rsvp`,
            payload: {
              displayName: 'Ada',
              response,
              rsvpToken: 'd'.repeat(32),
            },
          })
        ).statusCode,
      ).toBe(400);
    }
  });
  it('rejects expired invitations and invalid IDs', async () => {
    const night = await nights.create(group, {
      ...input(),
      agreement: {},
      startsAt: '2020-01-01T00:00:00Z',
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/nights/${night.id}/start`,
          headers: headers(),
          payload: { hostPin: '2468' },
        })
      ).statusCode,
    ).toBe(409);
    expect((await app.inject('/nights/nope')).statusCode).toBe(404);
  });
});

it('serializes memory-store mutations even after a rejected operation', async () => {
  const store = new MemoryGameNightStore();
  const order: number[] = [];
  const results = await Promise.allSettled([
    store.exclusive('night', async () => {
      order.push(1);
      throw new Error('failed');
    }),
    store.exclusive('night', async () => {
      order.push(2);
    }),
  ]);
  expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  expect(order).toEqual([1, 2]);
});
