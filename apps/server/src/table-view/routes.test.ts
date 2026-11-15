import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, expect, it, vi } from 'vitest';
import { tableViewRoutes } from './routes.js';
const state = {
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
      secretRole: 'traitor',
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
  hostToken: 'never share',
};
afterEach(() => vi.restoreAllMocks());
it('separates viewing and editing credentials, projects public fields, and revokes links', async () => {
  const app = Fastify();
  await app.register(rateLimit, { global: false });
  await app.register(tableViewRoutes);
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/tracker-shares',
      payload: state,
    });
    expect(created.statusCode).toBe(200);
    const { id, readToken, writeToken } = created.json();
    const url = `/tracker-shares/${id}`;
    expect(readToken).not.toBe(writeToken);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    const view = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${readToken}` },
    });
    expect(view.statusCode).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body).not.toContain('traitor');
    expect(view.body).not.toContain('hostToken');
    expect(view.body).not.toContain(writeToken);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          headers: { authorization: `Bearer ${readToken}` },
          payload: state,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url,
          headers: { authorization: `Bearer ${readToken}` },
        })
      ).statusCode,
    ).toBe(403);
    const updated = {
      ...state,
      players: state.players.map((p) => ({ ...p, life: 39 })),
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          headers: { authorization: `Bearer ${writeToken}` },
          payload: updated,
        })
      ).statusCode,
    ).toBe(200);
    const live = (
      await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${readToken}` },
      })
    ).json();
    expect(live.state.players[0].life).toBe(39);
    expect(live.revision).toBe(1);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url,
          headers: { authorization: `Bearer ${writeToken}` },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url,
          headers: { authorization: `Bearer ${readToken}` },
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
it('rejects malformed states and expires inactive shares', async () => {
  const app = Fastify();
  await app.register(rateLimit, { global: false });
  await app.register(tableViewRoutes);
  try {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tracker-shares',
          payload: { ...state, players: [] },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tracker-shares',
          payload: { ...state, players: [state.players[0], state.players[0]] },
        })
      ).statusCode,
    ).toBe(400);
    const { id, readToken } = (
      await app.inject({
        method: 'POST',
        url: '/tracker-shares',
        payload: state,
      })
    ).json();
    const current = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(current + 25 * 3600_000);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/tracker-shares/${id}`,
          headers: { authorization: `Bearer ${readToken}` },
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await app.close();
  }
});
