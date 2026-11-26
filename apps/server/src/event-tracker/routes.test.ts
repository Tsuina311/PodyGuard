import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';
import { MemoryEventTrackerStore } from './store.js';
import type { EventTrackerHistory } from '@podyguard/shared';

function history(ids: string[]): EventTrackerHistory {
  return { past: [], present: {
    gameMode: 'duel', rulesFormat: 'normal', players: ids.map((id, colorIndex) => ({
      id, name: `Player ${colorIndex}`, colorIndex, life: 20, minimumLife: 20, poison: 0, commanderTax: 0,
      counters: { energy: 0 }, enduringStory: false, cityBlessing: false, commanders: [], commanderDamage: {},
      eliminated: false, pendingLoss: null, answeredCauses: [],
    })), teams: null, teamMode: null, archenemyId: null, emperorIds: [], starOrder: [],
    assassinTargets: { [ids[0]!]: ids[1] }, assassinScores: {}, assassinContractsReady: false,
    treacheryRoles: { [ids[0]!]: 'traitor' }, treacheryIdentities: {}, treacheryUnveiled: [], treacheryRolesReady: false,
    schemeOrder: [], currentSchemeId: null, activeSchemeIds: [], pastSchemeIds: [], dayNight: null,
    dungeons: {}, completedDungeons: {}, monarchId: null, initiativeId: null, firstPlayerId: null,
    winnerId: null, startedAt: null, pausedAt: null, accumulatedPausedMs: 0, eliminations: [],
  } };
}
const aDevice = '11111111-1111-4111-8111-111111111111';
const bDevice = '22222222-2222-4222-8222-222222222222';
const cDevice = '33333333-3333-4333-8333-333333333333';
describe('one controller for an event game', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let events: EventService;
  const identity = createIdentityBoundary({ participantSessionSecret: 'shared-tracker-test' });
  let store: MemoryEventTrackerStore;
  let code: string;
  let host: { authorization: string };
  let seats: Array<{ id: string; token: string }>;
  let gameId: string;
  let tableId: string;
  let initial: EventTrackerHistory;
  const auth = (n: number) => ({ authorization: `Bearer ${seats[n]!.token}` });
  const post = (n: number, op: string, payload: object) => app.inject({ method: 'POST',
    url: `/events/${code}/tracker/${op}`, headers: auth(n), payload: { gameId, device: n === 0 ? aDevice : bDevice, ...payload } });
  beforeEach(async () => {
    store = new MemoryEventTrackerStore();
    // Deliberately fixed time: different games must not be identified by timestamps alone.
    events = new EventService(new MemoryEventStore(), identity, { isDev: true, now: () => new Date('2026-11-20T12:00:00Z') });
    app = await buildApp({ events, identity, eventTrackerStore: store, logger: false });
    const created = (await app.inject({ method: 'POST', url: '/events', payload: {
      name: 'One shared game', hostPin: '2468', tableCount: 2, gameMode: 'duel', rulesFormat: 'normal',
    } })).json();
    code = created.event.joinCode;
    host = { authorization: `Bearer ${created.hostToken}` };
    seats = [];
    for (let n = 0; n < 4; n++) {
      const joined = (await app.inject({ method: 'POST', url: `/events/${code}/join`, payload: { displayName: `Friend ${n}` } })).json();
      seats.push({ id: joined.participant.id, token: joined.token });
      await app.inject({ method: 'POST', url: `/events/${code}/ready`, headers: auth(n), payload: { ready: true } });
    }
    await app.inject({ method: 'POST', url: `/events/${code}/match`, headers: host });
    const tables = (await app.inject(`/events/${code}/tables`)).json().tables;
    for (const table of tables) await app.inject({ method: 'POST', url: `/events/${code}/tables/${table.id}/start`, headers: host });
    const roster = (await app.inject(`/events/${code}/participants`)).json().participants;
    const ownLabel = roster.find((p: { id: string }) => p.id === seats[0]!.id).tableLabel;
    const partner = seats.find(s => s.id !== seats[0]!.id && roster.find((p: { id: string }) => p.id === s.id).tableLabel === ownLabel)!;
    const outsider = seats.find(s => roster.find((p: { id: string }) => p.id === s.id).tableLabel !== ownLabel)!;
    seats = [seats[0]!, partner, outsider];
    const table = tables.find((t: { label: string }) => t.label === ownLabel);
    tableId = table.id;
    gameId = table.gameId;
    initial = history([seats[0]!.id, seats[1]!.id]);
  });
  afterEach(async () => app.close());

  it('atomically claims once and does not return private state to the other player', async () => {
    const replies = await Promise.all([post(0, 'claim', { history: initial }), post(1, 'claim', { history: initial })]);
    expect(replies.map(r => r.statusCode)).toEqual([200, 200]);
    const rows = replies.map(r => r.json().tracker);
    expect(rows.filter(r => r.owned)).toHaveLength(1);
    expect(rows[0].id).toBe(rows[1].id);
    const viewer = rows.find(r => !r.owned);
    expect(viewer.history).toBeUndefined();
    expect(viewer.state.treacheryRoles).toEqual({});
    expect(viewer.state.assassinTargets).toEqual({});
    const otherTable = (await app.inject({ url: `/events/${code}/tracker`, headers: auth(2) })).json();
    expect(otherTable.tracker).toBeNull();
  });

  it('lets a monitor with the event code follow only a published, active game', async () => {
    const monitor = async (selected = gameId) => {
      const response = await app.inject(`/events/${code.toLowerCase()}/monitor?gameId=${selected}`);
      expect(response.statusCode).toBe(200);
      return response.json();
    };
    const row = (await post(0, 'claim', { history: initial })).json().tracker;
    const identity = { id: row.id, generation: row.generation };
    const publish = { ...identity, monitorShared: true };
    expect(await monitor()).toEqual({ games: [], selected: null });
    expect((await post(1, 'monitor', publish)).statusCode).toBe(403);
    expect((await post(0, 'monitor', { ...publish, monitorShared: 'true' })).statusCode).toBe(400);
    expect((await post(0, 'monitor', publish)).statusCode).toBe(200);
    const before = await monitor();
    expect(before.games).toEqual([{ gameId, tableLabel: expect.any(String) }]);
    expect(before.selected.state.players[0].life).toBe(20);
    expect(before.selected.state.treacheryRoles).toEqual({});
    expect(before.selected.state.assassinTargets).toEqual({});
    expect(JSON.stringify(before)).not.toContain(row.readToken);

    const updated = structuredClone(initial);
    (updated.present.players as Array<{ life: number }>)[0]!.life = 19;
    expect((await post(0, 'update', { ...identity, history: updated, revision: row.revision })).statusCode).toBe(200);
    expect((await monitor()).selected.state.players[0].life).toBe(19);
    expect((await monitor('different-game')).selected).toBeNull();

    expect((await post(0, 'monitor', { ...publish, monitorShared: false })).statusCode).toBe(200);
    expect(await monitor()).toEqual({ games: [], selected: null });
    expect((await post(0, 'monitor', publish)).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/events/${code}/tables/${tableId}/cancel`, headers: host })).statusCode).toBe(200);
    expect(await monitor()).toEqual({ games: [], selected: null });
  });

  it('transfers the acknowledged state and undo history, rejects old writes and concurrent transfers', async () => {
    const row = (await post(0, 'claim', { history: initial })).json().tracker;
    const updated = structuredClone(initial);
    updated.past = [initial.present];
    updated.present.firstPlayerId = seats[1]!.id;
    updated.present.startedAt = Date.now();
    updated.present.pausedAt = Date.now() + 1000;
    (updated.present.players as Array<{ life: number }>)[0]!.life = 17;
    updated.present.hostToken = 'must-not-leak';
    expect((await post(0, 'update', { id: row.id, generation: 1, revision: 0, history: updated })).statusCode).toBe(200);
    expect((await post(0, 'update', { id: row.id, generation: 1, revision: 0, history: initial })).statusCode).toBe(409);
    const transfers = await Promise.all([
      post(1, 'transfer', { id: row.id, generation: 1 }),
      post(1, 'transfer', { id: row.id, generation: 1, device: cDevice }),
    ]);
    expect(transfers.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const pending = transfers.find(r => r.statusCode === 200)!.json().tracker;
    expect(pending.owned).toBe(false);
    expect(pending.generation).toBe(1);
    expect((await post(1, 'handoff', { id: row.id, generation: 1, revision: 1, history: updated, transferId: pending.transfer.id })).statusCode).toBe(403);
    expect((await post(0, 'handoff', { id: row.id, generation: 1, revision: 1, history: updated, transferId: pending.transfer.id })).statusCode).toBe(200);
    const next = (await app.inject({ url: `/events/${code}/tracker?device=${bDevice}`, headers: auth(1) })).json().tracker;
    expect(next.id).toBe(row.id);
    expect(next.history.present.firstPlayerId).toBe(seats[1]!.id);
    expect(next.history.present.players[0].life).toBe(17);
    expect(next.history.past).toHaveLength(1);
    expect(JSON.stringify(next)).not.toContain('must-not-leak');
    expect((await post(0, 'update', { id: row.id, generation: 1, revision: 1, history: initial })).statusCode).toBe(403);
    expect((await post(0, 'finish', { id: row.id, generation: 1, winnerParticipantId: seats[0]!.id })).statusCode).toBe(403);
    const viewed = await app.inject({ url: `/event-trackers/${row.id}/view`, headers: { authorization: `Bearer ${row.readToken}` } });
    expect(viewed.statusCode).toBe(200);
    expect(viewed.json().state.players[0].life).toBe(17);
    expect(viewed.json().history).toBeUndefined();
    expect(viewed.body).not.toContain('traitor');
    expect((await post(2, 'transfer', { id: row.id, generation: next.generation })).statusCode).not.toBe(200);
    const requestedBack = (await post(0, 'transfer', { id: row.id, generation: 2 })).json().tracker;
    await post(1, 'handoff', { id: row.id, generation: 2, revision: next.revision, history: next.history, transferId: requestedBack.transfer.id });
    const back = (await app.inject({ url: `/events/${code}/tracker?device=${aDevice}`, headers: auth(0) })).json().tracker;
    expect(back.generation).toBe(3);
    expect((await post(0, 'update', { id: row.id, generation: 1, revision: back.revision, history: initial })).statusCode).toBe(403);
  });

  it('leaves an offline controller in charge until it acknowledges with its latest local changes', async () => {
    const row = (await post(0, 'claim', { history: initial })).json().tracker;
    const pending = (await post(1, 'transfer', { id: row.id, generation: 1 })).json().tracker;
    expect(pending.ownerId).toBe(seats[0]!.id);
    expect(pending.owned).toBe(false);
    expect((await post(1, 'update', { id: row.id, generation: 1, revision: 0, history: initial })).statusCode).toBe(403);
    const local = structuredClone(initial);
    (local.present.players as Array<{ life: number }>)[0]!.life = 9;
    local.present.firstPlayerId = seats[1]!.id;
    local.past = [initial.present];
    const handed = await post(0, 'handoff', { id: row.id, generation: 1, revision: 0, history: local, transferId: pending.transfer.id });
    expect(handed.statusCode).toBe(200);
    const owner = (await app.inject({ url: `/events/${code}/tracker?device=${bDevice}`, headers: auth(1) })).json().tracker;
    expect(owner.owned).toBe(true);
    expect(owner.history.present.players[0].life).toBe(9);
    expect(owner.history.past).toHaveLength(1);
  });

  it('keeps ownership across app instances and isolates the next game even when start timestamps match', async () => {
    const row = (await post(0, 'claim', { history: initial })).json().tracker;
    await app.close();
    app = await buildApp({ events, identity, eventTrackerStore: store, logger: false });
    expect((await app.inject({ url: `/events/${code}/tracker?device=${aDevice}`, headers: auth(0) })).json().tracker.id).toBe(row.id);
    const oldGameId = gameId;
    await app.inject({ method: 'POST', url: `/events/${code}/tables/${tableId}/cancel`, headers: host });
    await app.inject({ method: 'POST', url: `/events/${code}/match`, headers: host });
    await app.inject({ method: 'POST', url: `/events/${code}/tables/${tableId}/start`, headers: host });
    gameId = (await app.inject(`/events/${code}/tables`)).json().tables.find((t: { id: string }) => t.id === tableId).gameId;
    expect(gameId).not.toBe(oldGameId);
    expect((await app.inject({ url: `/events/${code}/tracker`, headers: auth(0) })).json().tracker).toBeNull();
    expect((await post(0, 'heartbeat', { id: row.id, gameId: oldGameId, generation: 1 })).statusCode).toBe(409);
    const fresh = (await post(0, 'claim', { history: initial })).json().tracker;
    expect(fresh.id).not.toBe(row.id);
    expect(fresh.history.present.firstPlayerId).toBeNull();
    expect((await post(0, 'update', { id: row.id, generation: 1, revision: 0, history: initial })).statusCode).toBe(403);
  });

  it('expires unattended requests and resolves an interrupted handoff without revoking its controller', async () => {
    const row = (await post(0, 'claim', { history: initial })).json().tracker;
    const requested = (await post(1, 'transfer', { id: row.id, generation: 1 })).json().tracker;
    const stored = (await store.getById(row.id))!;
    await store.put({ ...stored, transfer: { ...stored.transfer!, requestedAt: Date.now() - 31_000 } });
    expect((await post(0, 'handoff', { id: row.id, generation: 1, revision: 0, history: initial, transferId: requested.transfer.id })).statusCode).toBe(409);
    const renewed = (await post(1, 'transfer', { id: row.id, generation: 1 })).json().tracker;
    expect(renewed.transfer.id).not.toBe(requested.transfer.id);
    expect((await post(0, 'handoff', { id: row.id, generation: 1, revision: 0, history: initial, transferId: requested.transfer.id })).statusCode).toBe(409);
    expect((await post(0, 'cancel-transfer', { id: row.id, generation: 1 })).json().tracker.owned).toBe(true);
    expect((await post(0, 'update', { id: row.id, generation: 1, revision: 0, history: initial })).statusCode).toBe(200);
    expect((await post(0, 'handoff', { id: row.id, generation: 1, revision: 1, history: initial, transferId: requested.transfer.id })).statusCode).toBe(409);
  });

  it('rejects forged rosters, malformed state and unauthenticated control requests', async () => {
    expect((await post(0, 'claim', { history: history(['forged', seats[0]!.id]) })).statusCode).toBe(400);
    expect((await post(0, 'claim', { history: { present: {}, past: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/events/${code}/tracker/claim`, payload: { device: aDevice, gameId, history: initial } })).statusCode).toBe(403);
    expect((await app.inject(`/event-trackers/not-a-uuid/view`)).statusCode).toBe(404);
  });
});
