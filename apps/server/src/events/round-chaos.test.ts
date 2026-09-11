import { describe, expect, it } from 'vitest';
import { attentionItems } from '@podyguard/shared';
import { buildApp } from '../app.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

/**
 * Approximates an 11-player Commander night: generate → publish → start →
 * report most results → refuse complete → force complete → next round with
 * late/drop attention, stale-basis keep, and table claim hygiene.
 */
describe('round chaos scenario', () => {
  it('survives an 11-player night with incomplete results and late drop', async () => {
    const identity = createIdentityBoundary({
      participantSessionSecret: 'chaos-secret',
    });
    const store = new MemoryEventStore();
    const events = new EventService(store, identity, {
      now: () => new Date('2026-09-11T18:00:00.000Z'),
    });
    const app = await buildApp({ identity, events, logger: false });

    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        name: 'Chaos Night',
        hostPin: '1357',
        tableCount: 4,
        gameMode: 'commander',
        preferredPodSize: 4,
        allowThreePods: true,
        operationMode: 'ROUNDS',
        roundCount: 3,
      },
    });
    expect(created.statusCode).toBe(201);
    const { event, hostToken } = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const joinCode = event.joinCode;
    const players: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: { displayName: `Chaos ${index + 1}` },
      });
      expect(joined.statusCode).toBe(201);
      players.push(
        (joined.json() as { participant: { id: string } }).participant.id,
      );
    }

    let generated = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(generated.statusCode).toBe(200);
    let snapshot = generated.json() as {
      event: {
        rounds: {
          rounds: Array<{
            id: string;
            number: number;
            status: string;
            version: number;
            pairingBasisStale?: boolean;
            assignments: Array<{
              id: string;
              tableId?: string;
              status: string;
              isBye?: boolean;
              participantIds: string[];
            }>;
          }>;
        };
      };
    };
    let round = snapshot.event.rounds.rounds[0]!;
    expect(round.assignments.length).toBeGreaterThanOrEqual(3);

    const published = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    expect(published.statusCode).toBe(200);
    snapshot = published.json() as typeof snapshot;
    round = snapshot.event.rounds.rounds[0]!;

    const eventRow = await store.findEventByJoinCode(joinCode);
    const claims = await store.listActiveTableReservations(eventRow!.id);
    expect(claims.every((row) => row.ownerType === 'ROUND_ASSIGNMENT')).toBe(
      true,
    );
    expect(claims.length).toBe(
      round.assignments.filter((row) => row.tableId && !row.isBye).length,
    );

    const started = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/start`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    expect(started.statusCode).toBe(200);
    snapshot = started.json() as typeof snapshot;
    round = snapshot.event.rounds.rounds[0]!;

    const playable = round.assignments.filter(
      (row) => !row.isBye && row.status !== 'COMPLETED',
    );
    for (const assignment of playable.slice(0, -1)) {
      const reported = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/rounds/assignments/${assignment.id}/result`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { expectedVersion: round.version },
      });
      expect(reported.statusCode).toBe(200);
      snapshot = reported.json() as typeof snapshot;
      round = snapshot.event.rounds.rounds[0]!;
    }

    const refused = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/complete`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    expect(refused.statusCode).toBe(400);

    const forced = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/complete`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        expectedVersion: round.version,
        force: true,
        forceReason: 'last table abandoned',
      },
    });
    expect(forced.statusCode).toBe(200);
    snapshot = forced.json() as typeof snapshot;
    expect(
      await store.listActiveTableReservations(eventRow!.id),
    ).toHaveLength(0);

    generated = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(generated.statusCode).toBe(200);
    snapshot = generated.json() as typeof snapshot;
    round = snapshot.event.rounds.rounds.find((row) => row.number === 2)!;

    const dropped = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/participants/${players[0]}/drop`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    expect(dropped.statusCode).toBe(200);
    snapshot = dropped.json() as typeof snapshot;
    round = snapshot.event.rounds.rounds.find((row) => row.number === 2)!;

    const late = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/participants/${players[10]}/late-register`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    expect(late.statusCode).toBe(200);
    snapshot = late.json() as typeof snapshot;

    const published2 = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        expectedVersion: (
          snapshot.event.rounds.rounds.find((row) => row.number === 2) ??
          snapshot.event.rounds.rounds[0]!
        ).version,
      },
    });
    expect(published2.statusCode).toBe(200);
    snapshot = published2.json() as typeof snapshot;
    const fullRounds = snapshot.event.rounds as import('@podyguard/shared').RoundEventState;
    const attention = attentionItems(fullRounds);
    expect(
      attention.some(
        (item) =>
          item.code === 'DROPPED_STILL_SEATED' || item.code === 'LATE_WAITING',
      ),
    ).toBe(true);
  });
});
