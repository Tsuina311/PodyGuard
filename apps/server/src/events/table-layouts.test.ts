import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createIdentityBoundary } from '../identity/index.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { projectPublicDisplayState } from '../display/project-display-state.js';
import { defaultLimitedEventModeConfig, type LimitedTablePlan } from '@podyguard/shared';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function fixture(payload: Record<string, unknown>) {
  const identity = createIdentityBoundary({ participantSessionSecret: 'table-layout-test' });
  const store = new MemoryEventStore();
  const events = new EventService(store, identity);
  const app = await buildApp({ identity, events, logger: false });
  apps.push(app);
  const response = await app.inject({ method: 'POST', url: '/events', payload: { name: 'Tables', hostPin: '2468', tableCount: 1, ...payload } });
  return { app, store, events, response };
}

describe('table layouts through the event API', () => {
  it('creates two independent Commander areas at a seven-seat table and seats 4 + 3 without overfilling', async () => {
    const { app, events, response } = await fixture({ gameMode: 'commander', allowThreePods: true, allowFivePods: false,
      tableLayouts: [{ shape: 'rectangle', seats: 7 }] });
    expect(response.statusCode).toBe(201);
    const { event: { joinCode }, hostToken } = response.json();
    for (let index = 0; index < 7; index++) {
      const joined = await app.inject({ method: 'POST', url: `/events/${joinCode}/join`, payload: { displayName: `Player ${index}` } });
      await app.inject({ method: 'POST', url: `/events/${joinCode}/ready`, headers: { authorization: `Bearer ${joined.json().token}` }, payload: { ready: true } });
    }
    const preview = await events.previewMatches(joinCode, hostToken);
    expect(preview.pods.map(pod => pod.playerNames.length).sort()).toEqual([3, 4]);
    const snapshot = await events.getSnapshot(joinCode);
    expect(snapshot.tables.map(table => table.label)).toEqual(['Table 1 · Part A', 'Table 1 · Part B']);
    expect(snapshot.tables.map(table => table.area?.seats)).toEqual([4, 3]);
  }, 15_000);
  it('reserves the entire draft table, then assigns four duels to a 4 + 2 + 2 playing layout', async () => {
    const tablePlan: LimitedTablePlan = { draft: [{ shape: 'round', seats: 8 }], play: [
      { shape: 'square', seats: 4 }, { shape: 'rectangle', seats: 2 }, { shape: 'round', seats: 2 },
    ] };
    const { app, events, response, store } = await fixture({ limitedModeConfigs: [{ ...defaultLimitedEventModeConfig('BOOSTER_DRAFT'), totalRounds: 1, tablePlan }] });
    expect(response.statusCode).toBe(201);
    const { event: { joinCode }, hostToken } = response.json();
    const players: { id: string; token: string }[] = [];
    for (let index = 0; index < 8; index++) {
      const joined = (await app.inject({ method: 'POST', url: `/events/${joinCode}/join`, payload: { displayName: `Player ${index}` } })).json();
      players.push({ id: joined.participant.id, token: joined.token });
      await app.inject({ method: 'PUT', url: `/events/${joinCode}/limited/queue`, headers: { authorization: `Bearer ${joined.token}` }, payload: { mode: 'BOOSTER_DRAFT' } });
      await app.inject({ method: 'POST', url: `/events/${joinCode}/ready`, headers: { authorization: `Bearer ${joined.token}` }, payload: { ready: true } });
    }
    const assigned = await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/assign`, headers: { authorization: `Bearer ${hostToken}` }, payload: { mode: 'BOOSTER_DRAFT' } });
    expect(assigned.statusCode, assigned.body).toBe(200);
    const session = assigned.json().session;
    expect(session.draftTableIds).toHaveLength(2);
    const snapshot = await events.getSnapshot(joinCode);
    expect(snapshot.tables.filter(table => table.status === 'occupied').map(table => table.area?.tableNumber)).toEqual([1, 1]);
    for (let index = 0; index < players.length; index++) {
      const headers = { authorization: `Bearer ${players[index]!.token}` };
      await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/sessions/${session.id}/seat`, headers, payload: { seat: index + 1 } });
      await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/sessions/${session.id}/seated`, headers });
    }
    for (const status of ['DRAFTING', 'DECKBUILDING']) {
      const moved = await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/sessions/${session.id}/phase`, headers: { authorization: `Bearer ${hostToken}` }, payload: { status } });
      expect(moved.statusCode, moved.body).toBe(200);
    }
    // Occupy all extra playing areas. Starting a round must fail without
    // creating unassigned games or losing the original draft reservations.
    for (const table of snapshot.tables.filter(table => table.area?.tableNumber !== 1)) {
      await store.claimTable({ eventId: snapshot.event.id, tableId: table.id,
        ownerType: 'MANUAL_RESERVATION', ownerId: 'other-game', purpose: 'HOLD' });
    }
    const blocked = await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/sessions/${session.id}/rounds`, headers: { authorization: `Bearer ${hostToken}` } });
    expect(blocked.statusCode).toBe(409);
    expect((await events.getSnapshot(joinCode)).limitedSessions?.[0]?.rounds).toHaveLength(0);
    await store.releaseAllOwnedTables({ eventId: snapshot.event.id, ownerType: 'MANUAL_RESERVATION', ownerId: 'other-game' });
    const round = await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/sessions/${session.id}/rounds`, headers: { authorization: `Bearer ${hostToken}` } });
    expect(round.statusCode).toBe(201);
    const matches = round.json().session.rounds[0].matches;
    expect(matches.map((match: { tableLabel: string }) => match.tableLabel)).toEqual(['Table 1 · Part A', 'Table 1 · Part B', 'Table 2', 'Table 3']);
    const reservations = await store.listActiveTableReservations(snapshot.event.id);
    expect(reservations).toHaveLength(4);
    const first = matches[0];
    const concurrent = matches[1];
    const concurrentUrl = `/events/${joinCode}/limited/sessions/${session.id}/matches/${concurrent.id}/progress`;
    const competing = await Promise.all([concurrent.playerAId, concurrent.playerBId].map((id, index) => app.inject({
      method: 'POST', url: concurrentUrl,
      headers: { authorization: `Bearer ${players.find(player => player.id === id)!.token}` },
      payload: { playerAGameWins: index === 0 ? 1 : 0, playerBGameWins: index === 1 ? 1 : 0 },
    })));
    expect(competing.filter(response => response.statusCode === 200)).toHaveLength(1);
    expect(competing.filter(response => response.statusCode === 400 || response.statusCode === 409)).toHaveLength(1);
    const reporterToken = players.find(player => player.id === first.playerAId)!.token;
    const progressUrl = `/events/${joinCode}/limited/sessions/${session.id}/matches/${first.id}/progress`;
    const progress = (token: string, payload: Record<string, unknown>) => app.inject({
      method: 'POST', url: progressUrl, headers: { authorization: `Bearer ${token}` }, payload,
    });
    expect((await progress(players.find(player => player.id !== first.playerAId && player.id !== first.playerBId)!.token,
      { playerAGameWins: 1, playerBGameWins: 0 })).statusCode).toBe(409);
    const started = await progress(reporterToken, { playerAGameWins: 0, playerBGameWins: 0, startGame: true });
    expect(started.statusCode, started.body).toBe(200);
    const firstStart = started.json().session.rounds[0].matches[0].currentGameStartedAt;
    expect(firstStart).toEqual(expect.any(String));
    expect((await progress(reporterToken, { playerAGameWins: 0, playerBGameWins: 0, startGame: true }))
      .json().session.rounds[0].matches[0].currentGameStartedAt).toBe(firstStart);
    expect((await progress(reporterToken, { playerAGameWins: 1, playerBGameWins: 0 })).statusCode).toBe(200);
    expect((await progress(reporterToken, { playerAGameWins: 1, playerBGameWins: 0 })).statusCode).toBe(200);
    expect((await progress(reporterToken, { playerAGameWins: 0, playerBGameWins: 0 })).statusCode).toBe(400);
    expect((await progress(reporterToken, { playerAGameWins: 2, playerBGameWins: 0 })).statusCode).toBe(400);
    const beforeSecondGame = await events.getSnapshot(joinCode);
    const savedMatch = beforeSecondGame.limitedSessions![0]!.rounds[0]!.matches[0]!;
    expect(savedMatch).toMatchObject({ status: 'PLAYING', playerAGameWins: 1, playerBGameWins: 0 });
    expect(savedMatch.currentGameStartedAt).toBeUndefined();
    expect(await store.listActiveTableReservations(snapshot.event.id)).toHaveLength(4);
    await progress(reporterToken, { playerAGameWins: 1, playerBGameWins: 0, startGame: true });
    const withTimer = await events.getSnapshot(joinCode);
    for (const showTimers of [true, false]) {
      const display = projectPublicDisplayState({ snapshot: withTimer, pods: [], announcement: null,
        config: { mode: 'LIMITED', showPlayerNames: true, showQueues: true, showTimers } });
      expect(display.limitedSessions[0]!.matches[0]).toMatchObject({ bestOf: 3, playerAGameWins: 1, playerBGameWins: 0 });
      expect(Boolean(display.limitedSessions[0]!.matches[0]!.currentGameStartedAt)).toBe(showTimers);
      expect(display.limitedSessions[0]!.resultsReported).toBe(0);
    }
    const result = await app.inject({ method: 'POST', url: `/events/${joinCode}/limited/sessions/${session.id}/matches/${first.id}/result`,
      headers: { authorization: `Bearer ${players.find(player => player.id === first.playerAId)!.token}` },
      payload: { outcome: 'PLAYER_A_WIN', playerAGameWins: 2, playerBGameWins: 0 } });
    expect(result.statusCode, result.body).toBe(200);
    const after = await events.getSnapshot(joinCode);
    expect(after.tables[0]!.status).toBe('free');
    expect(after.tables[1]!.status).toBe('occupied');
  });
  it('returns a useful validation error without creating invalid table inventory', async () => {
    const { response } = await fixture({ tableLayouts: [{ shape: 'square', seats: -1 }] });
    expect(response.statusCode).toBe(400);
    const second = await fixture({ gameMode: 'commander', allowThreePods: false, allowFivePods: false, tableLayouts: [{ shape: 'round', seats: 3 }] });
    expect(second.response.statusCode).toBe(400);
  });
});
