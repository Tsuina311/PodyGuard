import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

async function fixture(playerCount = 8) {
  const identity = createIdentityBoundary({
    participantSessionSecret: 'round-test-secret',
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    now: () => new Date('2026-09-11T12:00:00.000Z'),
  });
  const app = await buildApp({ identity, events, logger: false });
  const created = await app.inject({
    method: 'POST',
    url: '/events',
    payload: {
      name: 'Round Night',
      hostPin: '2468',
      tableCount: 4,
      gameMode: 'commander',
      preferredPodSize: 4,
      allowThreePods: true,
      operationMode: 'ROUNDS',
      roundCount: 3,
    },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json() as {
    event: {
      joinCode: string;
      operationMode?: string;
      rounds?: {
        activityKind: string;
        currentRoundNumber: number;
        rounds: Array<{
          number: number;
          status: string;
          version: number;
          pairingBasisStale?: boolean;
          assignments: Array<{
            id: string;
            tableId?: string;
            participantIds: string[];
            locked?: boolean;
            status: string;
            outcome?: string;
          }>;
        }>;
        metrics: Record<string, number>;
      };
    };
    hostToken: string;
  };
  const players: Array<{ id: string; token: string }> = [];
  for (let index = 0; index < playerCount; index += 1) {
    const joined = await app.inject({
      method: 'POST',
      url: `/events/${body.event.joinCode}/join`,
      payload: { displayName: `Player ${index + 1}` },
    });
    expect(joined.statusCode).toBe(201);
    const joinedBody = joined.json() as {
      participant: { id: string };
      token: string;
    };
    players.push({ id: joinedBody.participant.id, token: joinedBody.token });
  }
  return {
    app,
    joinCode: body.event.joinCode,
    hostToken: body.hostToken,
    players,
    createdEvent: body.event,
  };
}

describe('round mode orchestration', () => {
  it('creates a ROUNDS event with initialized round state', async () => {
    const { createdEvent } = await fixture(0);
    expect(createdEvent.operationMode).toBe('ROUNDS');
    expect(createdEvent.rounds).toMatchObject({
      activityKind: 'POD',
      currentRoundNumber: 0,
      preferredPodSize: 4,
    });
    expect(createdEvent.rounds?.rounds).toEqual([]);
  });

  it('generates, publishes, and starts a round', async () => {
    const { app, joinCode, hostToken } = await fixture(8);

    const generated = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(generated.statusCode).toBe(200);
    const generatedBody = generated.json() as {
      event: {
        rounds: {
          currentRoundNumber: number;
          rounds: Array<{ status: string; version: number; number: number }>;
          metrics: { roundsGenerated: number };
        };
      };
    };
    expect(generatedBody.event.rounds.currentRoundNumber).toBe(1);
    expect(generatedBody.event.rounds.rounds[0]).toMatchObject({
      number: 1,
      status: 'PLANNING',
      version: 1,
    });
    expect(generatedBody.event.rounds.metrics.roundsGenerated).toBe(1);
    const version = generatedBody.event.rounds.rounds[0]!.version;

    const published = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: version },
    });
    expect(published.statusCode).toBe(200);
    const publishedBody = published.json() as {
      event: { rounds: { rounds: Array<{ status: string; version: number }> } };
    };
    expect(publishedBody.event.rounds.rounds[0]).toMatchObject({
      status: 'PUBLISHED',
      version: version + 1,
    });

    const started = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/start`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: version + 1 },
    });
    expect(started.statusCode).toBe(200);
    const startedBody = started.json() as {
      event: {
        rounds: {
          rounds: Array<{
            status: string;
            assignments: Array<{ status: string }>;
          }>;
        };
      };
    };
    expect(startedBody.event.rounds.rounds[0]?.status).toBe('ACTIVE');
    expect(
      startedBody.event.rounds.rounds[0]?.assignments.every(
        (assignment) =>
          assignment.status === 'PLAYING' || assignment.status === 'COMPLETED',
      ),
    ).toBe(true);

    const matchNow = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(matchNow.statusCode).toBe(409);
    expect(matchNow.json()).toMatchObject({
      error: { code: 'ROUND_MODE_REQUIRED' },
    });
  });

  it('surgical repair leaves a locked table unchanged', async () => {
    const { app, joinCode, hostToken } = await fixture(8);

    const generated = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const generatedBody = generated.json() as {
      event: {
        rounds: {
          rounds: Array<{
            version: number;
            assignments: Array<{
              id: string;
              tableId?: string;
              participantIds: string[];
            }>;
          }>;
        };
      };
    };
    const round = generatedBody.event.rounds.rounds[0]!;
    expect(round.assignments.length).toBeGreaterThanOrEqual(2);
    const locked = round.assignments[0]!;
    const unlockedIds = round.assignments.slice(1).map((row) => row.id);

    const repaired = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/repair`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        expectedVersion: round.version,
        unlockedAssignmentIds: unlockedIds,
      },
    });
    expect(repaired.statusCode).toBe(200);
    const repairedBody = repaired.json() as {
      event: {
        rounds: {
          rounds: Array<{
            assignments: Array<{
              id: string;
              tableId?: string;
              participantIds: string[];
              locked?: boolean;
            }>;
          }>;
          metrics: { localRepairs: number };
        };
      };
    };
    const next = repairedBody.event.rounds.rounds[0]!;
    const lockedAfter = next.assignments.find((row) => row.id === locked.id);
    expect(lockedAfter).toEqual({
      ...locked,
      locked: true,
    });
    expect(repairedBody.event.rounds.metrics.localRepairs).toBe(1);
  });

  it('correcting a prior result marks current pairing basis stale without reshuffling', async () => {
    const { app, joinCode, hostToken } = await fixture(4);

    const firstGenerate = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    let snapshot = firstGenerate.json() as {
      event: {
        rounds: {
          rounds: Array<{
            number: number;
            status: string;
            version: number;
            pairingBasisStale?: boolean;
            assignments: Array<{
              id: string;
              participantIds: string[];
              status: string;
              outcome?: string;
            }>;
          }>;
          metrics: {
            previousResultsCorrected: number;
            pairingKeptDespiteStaleBasis: number;
          };
        };
      };
    };
    let round = snapshot.event.rounds.rounds[0]!;

    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    const started = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/start`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version + 1 },
    });
    snapshot = started.json() as typeof snapshot;
    round = snapshot.event.rounds.rounds[0]!;

    for (const assignment of round.assignments) {
      if (assignment.status === 'COMPLETED') continue;
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
    round = snapshot.event.rounds.rounds[0]!;

    const completed = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/complete`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: round.version },
    });
    expect(completed.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(second.statusCode).toBe(200);
    const beforeCorrect = second.json() as typeof snapshot;
    const current = beforeCorrect.event.rounds.rounds.find(
      (row) => row.number === 2,
    )!;
    const prior = beforeCorrect.event.rounds.rounds.find(
      (row) => row.number === 1,
    )!;
    const priorAssignment = prior.assignments[0]!;
    const seatingBefore = current.assignments.map((row) => ({
      id: row.id,
      participantIds: [...row.participantIds],
    }));

    const corrected = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/assignments/${priorAssignment.id}/correct`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        expectedVersion: current.version,
        roundNumber: 1,
        reason: 'misreported winner',
      },
    });
    expect(corrected.statusCode).toBe(200);
    const after = corrected.json() as typeof snapshot;
    const currentAfter = after.event.rounds.rounds.find(
      (row) => row.number === 2,
    )!;
    expect(currentAfter.pairingBasisStale).toBe(true);
    expect(
      currentAfter.assignments.map((row) => ({
        id: row.id,
        participantIds: [...row.participantIds],
      })),
    ).toEqual(seatingBefore);
    expect(after.event.rounds.metrics.previousResultsCorrected).toBe(1);
    expect(after.event.rounds.metrics.pairingKeptDespiteStaleBasis).toBe(0);

    const kept = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/stale-basis`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        expectedVersion: currentAfter.version,
        decision: 'keep',
      },
    });
    expect(kept.statusCode).toBe(200);
    const keptBody = kept.json() as typeof snapshot;
    const keptRound = keptBody.event.rounds.rounds.find(
      (row) => row.number === 2,
    )!;
    expect(keptRound.pairingBasisStale).toBe(false);
    expect(keptBody.event.rounds.metrics.pairingKeptDespiteStaleBasis).toBe(1);
  });

  it('publish claims tables and rejects a second publish with a stale version', async () => {
    const { app, joinCode, hostToken } = await fixture(8);
    const generated = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const body = generated.json() as {
      event: {
        rounds: {
          rounds: Array<{
            version: number;
            assignments: Array<{ tableId?: string }>;
          }>;
        };
      };
    };
    const version = body.event.rounds.rounds[0]!.version;
    const first = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: version },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { expectedVersion: version },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: { code: 'ROUND_CHANGED' },
    });

    const tablesResponse = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    const tables = (
      tablesResponse.json() as {
        tables: Array<{ id: string; status: string }>;
      }
    ).tables;
    const assigned = new Set(
      body.event.rounds.rounds[0]!.assignments
        .map((row) => row.tableId)
        .filter(Boolean),
    );
    for (const table of tables) {
      if (assigned.has(table.id)) {
        expect(table.status).toBe('occupied');
      }
    }
  });

  it('createPod is blocked while a ROUND_ASSIGNMENT claim is active', async () => {
    const identity = createIdentityBoundary({
      participantSessionSecret: 'round-test-secret',
    });
    const store = new MemoryEventStore();
    const events = new EventService(store, identity, {
      now: () => new Date('2026-09-11T12:00:00.000Z'),
    });
    const app = await buildApp({ identity, events, logger: false });
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        name: 'Claim Night',
        hostPin: '2468',
        tableCount: 2,
        gameMode: 'commander',
        preferredPodSize: 4,
        allowThreePods: true,
        operationMode: 'ROUNDS',
      },
    });
    const body = created.json() as {
      event: { joinCode: string; id?: string };
      hostToken: string;
    };
    for (let index = 0; index < 4; index += 1) {
      await app.inject({
        method: 'POST',
        url: `/events/${body.event.joinCode}/join`,
        payload: { displayName: `P${index + 1}` },
      });
    }
    const generated = await app.inject({
      method: 'POST',
      url: `/events/${body.event.joinCode}/rounds/generate`,
      headers: { authorization: `Bearer ${body.hostToken}` },
    });
    const generatedBody = generated.json() as {
      event: {
        id: string;
        rounds: {
          rounds: Array<{
            version: number;
            assignments: Array<{ tableId?: string }>;
          }>;
        };
      };
    };
    const tableId = generatedBody.event.rounds.rounds[0]!.assignments.find(
      (row) => row.tableId,
    )!.tableId!;
    await app.inject({
      method: 'POST',
      url: `/events/${body.event.joinCode}/rounds/publish`,
      headers: { authorization: `Bearer ${body.hostToken}` },
      payload: {
        expectedVersion: generatedBody.event.rounds.rounds[0]!.version,
      },
    });

    const eventId = (await store.findEventByJoinCode(body.event.joinCode))!.id;
    const people = await store.listParticipants(eventId);
    await expect(
      store.createPod({
        eventId,
        tableId,
        poolId: 'mid',
        seats: people.slice(0, 4).map((person) => ({
          participantId: person.id,
          deckId: 'none',
          assignedPoolId: 'mid',
        })),
      }),
    ).rejects.toMatchObject({ code: 'LIMITED_PERSISTENCE_CONFLICT' });
  });

  it('stale release of an old round claim does not free a newer claim', async () => {
    const store = new MemoryEventStore();
    const event = await store.insertEvent({
      name: 'Stale',
      joinCode: 'STALE1',
      hostCredentialHash: 'x',
      operationMode: 'ROUNDS',
    });
    const table = await store.insertTable({
      eventId: event.id,
      label: '1',
      sortOrder: 0,
    });
    await store.claimTable({
      eventId: event.id,
      tableId: table.id,
      ownerType: 'ROUND_ASSIGNMENT',
      ownerId: 'round-2:a1',
      purpose: 'ROUND',
    });
    const released = await store.releaseTableIfOwned({
      tableId: table.id,
      ownerType: 'ROUND_ASSIGNMENT',
      ownerId: 'round-1:a1',
    });
    expect(released).toBe(false);
    const active = await store.listActiveTableReservations(event.id);
    expect(active).toHaveLength(1);
    expect(active[0]?.ownerId).toBe('round-2:a1');
    expect((await store.findTableById(table.id))?.status).toBe('occupied');
  });
});
