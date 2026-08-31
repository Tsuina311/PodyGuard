import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

async function fixture(
  mode: 'BOOSTER_DRAFT' | 'SEALED' = 'BOOSTER_DRAFT',
  options: { preferredCohortSize?: number; allowUndersizedLaunch?: boolean } = {},
) {
  const identity = createIdentityBoundary({
    participantSessionSecret: 'limited-test-secret',
  });
  const events = new EventService(new MemoryEventStore(), identity, {
    now: () => new Date('2026-08-31T10:00:00.000Z'),
  });
  const app = await buildApp({ identity, events, logger: false });
  const podSize = mode === 'BOOSTER_DRAFT' ? 8 : 4;
  const created = await app.inject({
    method: 'POST',
    url: '/events',
    payload: {
      name: 'Limited Night',
      hostPin: '2468',
      tableCount: 4,
      limitedModeConfigs: [
        {
          mode,
          enabled: true,
          preferredCohortSize: options.preferredCohortSize ?? podSize,
          minCohortSize: podSize,
          maxCohortSize: podSize,
          allowUndersizedLaunch: options.allowUndersizedLaunch ?? false,
          totalRounds: 1,
          deckbuildingMinutes: 20,
          roundMinutes: 35,
          matchStructure: 'BO1',
        },
      ],
    },
  });
  const event = created.json() as {
    event: { joinCode: string; limitedModeConfigs: unknown[] };
    hostToken: string;
  };
  const players: Array<{ id: string; token: string }> = [];
  for (let index = 0; index < podSize; index += 1) {
    const joined = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/join`,
      payload: { displayName: `Player ${index + 1}` },
    });
    const player = joined.json() as {
      participant: { id: string };
      token: string;
    };
    players.push({ id: player.participant.id, token: player.token });
  }
  return {
    app,
    joinCode: event.event.joinCode,
    hostToken: event.hostToken,
    players,
    modeConfigs: event.event.limitedModeConfigs,
  };
}

describe('Limited server orchestration', () => {
  it('forms deterministically, seats a draft, runs a round, and restricts corrections', async () => {
    const { app, joinCode, hostToken, players, modeConfigs } = await fixture();
    expect(modeConfigs).toMatchObject([
      { mode: 'BOOSTER_DRAFT', enabled: true, totalRounds: 1 },
    ]);

    for (const player of players) {
      const queued = await app.inject({
        method: 'PUT',
        url: `/events/${joinCode}/limited/queue`,
        headers: { authorization: `Bearer ${player.token}` },
        payload: { mode: 'BOOSTER_DRAFT' },
      });
      expect(queued.statusCode).toBe(200);
    }

    const snapshot = await app.events.getSnapshot(joinCode);
    expect(snapshot.limitedQueues).toMatchObject([
      { mode: 'BOOSTER_DRAFT', waitingCount: 0 },
    ]);
    const formed = snapshot.limitedSessions?.[0];
    const deterministicOrder = players
      .map((player) => player.id)
      .sort((left, right) => left.localeCompare(right));
    expect(formed).toMatchObject({
      mode: 'BOOSTER_DRAFT',
      status: 'FORMING',
      participants: deterministicOrder.map((participantId, index) => ({
        participantId,
        draftSeat: index + 1,
      })),
    });
    if (!formed) throw new Error('Automatic draft session was not formed.');

    const unauthorizedLaunch = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/launch`,
      headers: { authorization: `Bearer ${players[0]!.token}` },
    });
    expect(unauthorizedLaunch.statusCode).toBe(401);

    const launch = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/launch`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(launch.json()).toMatchObject({ session: { status: 'SEATING' } });

    const drafting = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/phase`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { status: 'DRAFTING', durationSeconds: 900 },
    });
    expect(drafting.json()).toMatchObject({
      session: { status: 'DRAFTING', timer: { phase: 'DRAFTING' } },
    });

    const paused = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/timer`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { action: 'PAUSE' },
    });
    expect(paused.json()).toMatchObject({
      session: { timer: { status: 'PAUSED', remainingSecondsWhenPaused: 900 } },
    });
    const resumed = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/timer`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { action: 'ADD', seconds: 60 },
    });
    expect(resumed.json()).toMatchObject({
      session: { timer: { remainingSecondsWhenPaused: 960 } },
    });

    const deckbuilding = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/phase`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { status: 'DECKBUILDING' },
    });
    expect(deckbuilding.json()).toMatchObject({
      session: {
        status: 'DECKBUILDING',
        timer: { phase: 'DECKBUILDING', durationSeconds: 1200 },
      },
    });

    const round = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/rounds`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const active = (round.json() as {
      session: {
        status: string;
        rounds: Array<{
          matches: Array<{
            id: string;
            playerAId: string;
            playerBId: string;
            tableId: string;
          }>;
        }>;
      };
    }).session;
    expect(active.status).toBe('ROUND_ACTIVE');
    expect(active.rounds[0]?.matches).toHaveLength(4);
    expect(
      new Set(active.rounds[0]?.matches.map((match) => match.tableId)).size,
    ).toBe(4);

    const first = active.rounds[0]!.matches[0]!;
    const firstReporter = players.find((player) => player.id === first.playerAId)!;
    const reported = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/matches/${first.id}/result`,
      headers: { authorization: `Bearer ${firstReporter.token}` },
      payload: {
        outcome: 'PLAYER_A_WIN',
        playerAGameWins: 1,
        playerBGameWins: 0,
      },
    });
    expect(reported.statusCode).toBe(200);
    const playerCorrection = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/matches/${first.id}/result`,
      headers: { authorization: `Bearer ${firstReporter.token}` },
      payload: {
        outcome: 'PLAYER_B_WIN',
        playerAGameWins: 0,
        playerBGameWins: 1,
      },
    });
    expect(playerCorrection.statusCode).toBe(409);
    const corrected = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/matches/${first.id}/correct`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        outcome: 'PLAYER_B_WIN',
        playerAGameWins: 0,
        playerBGameWins: 1,
        correctionReason: 'Players were entered backwards',
      },
    });
    expect(corrected.statusCode).toBe(200);

    for (const match of active.rounds[0]!.matches.slice(1)) {
      const reporter = players.find((player) => player.id === match.playerAId)!;
      const completed = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${formed.id}/matches/${match.id}/result`,
        headers: { authorization: `Bearer ${reporter.token}` },
        payload: {
          outcome: 'DRAW',
          playerAGameWins: 0,
          playerBGameWins: 0,
        },
      });
      expect(completed.statusCode).toBe(200);
    }
    const finalSnapshot = await app.events.getSnapshot(joinCode);
    const finalSession = finalSnapshot.limitedSessions?.find(
      (session) => session.id === formed.id,
    );
    expect(finalSession?.status).toBe('COMPLETED');
    expect(finalSession?.standings[0]).toMatchObject({
      participantId: first.playerBId,
      points: 3,
      rank: 1,
    });
    const tables = await app.events.listTables(joinCode);
    expect(tables.every((table) => table.status === 'free')).toBe(true);
    await expect(app.events.getMetrics(joinCode, hostToken)).resolves.toMatchObject({
      limited: {
        sessions: 1,
        completedSessions: 1,
        resultCorrections: 1,
        averageCohortSize: 8,
      },
    });
    await app.close();
  });

  it('sends Sealed directly from seating to timed deckbuilding', async () => {
    const { app, joinCode, hostToken, players } = await fixture('SEALED');
    for (const player of players) {
      await app.inject({
        method: 'PUT',
        url: `/events/${joinCode}/limited/queue`,
        headers: { authorization: `Bearer ${player.token}` },
        payload: { mode: 'SEALED' },
      });
    }
    const session = (await app.events.getSnapshot(joinCode)).limitedSessions?.[0];
    if (!session) throw new Error('Automatic Sealed session was not formed.');
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${session.id}/launch`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const skippedDraft = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${session.id}/phase`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { status: 'DECKBUILDING' },
    });
    expect(skippedDraft.statusCode).toBe(200);
    expect(skippedDraft.json()).toMatchObject({
      session: { status: 'DECKBUILDING', timer: { durationSeconds: 1200 } },
    });
    await app.close();
  });

  it('keeps Limited-queued players out of Commander matching', async () => {
    const { app, joinCode, hostToken, players } = await fixture();
    await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/limited/queue`,
      headers: { authorization: `Bearer ${players[0]!.token}` },
      payload: { mode: 'BOOSTER_DRAFT' },
    });
    const conflictingReady = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${players[0]!.token}` },
      payload: { ready: true },
    });
    expect(conflictingReady.statusCode).toBe(409);
    for (const player of players.slice(1)) {
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/ready`,
        headers: { authorization: `Bearer ${player.token}` },
        payload: { ready: true },
      });
    }
    const matched = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const pods = (matched.json() as {
      pods: Array<{ playerNames: string[] }>;
    }).pods;
    expect(pods.length).toBeGreaterThanOrEqual(1);
    const matchedNames = pods.flatMap((pod) => pod.playerNames);
    expect(matchedNames).not.toContain('Player 1');
    expect(matchedNames.length).toBeGreaterThanOrEqual(4);
    await app.close();
  });

  it('lets the host reorder a draft and reuse draft tables for play', async () => {
    const { app, joinCode, hostToken, players } = await fixture('BOOSTER_DRAFT');
    for (const player of players) {
      await app.inject({
        method: 'PUT',
        url: `/events/${joinCode}/limited/queue`,
        headers: { authorization: `Bearer ${player.token}` },
        payload: { mode: 'BOOSTER_DRAFT' },
      });
    }
    const formed = (await app.events.getSnapshot(joinCode)).limitedSessions?.[0];
    if (!formed) throw new Error('Automatic draft session was not formed.');
    const sessionId = formed.id;
    const tables = await app.events.listTables(joinCode);
    await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/tables`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { draftTableIds: tables.map((table) => table.id) },
    });
    const reversed = [...players].reverse().map((player) => player.id);
    const roster = await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/roster`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { participantIds: reversed },
    });
    expect(roster.json()).toMatchObject({
      session: {
        participants: reversed.map((participantId, index) => ({
          participantId,
          draftSeat: index + 1,
        })),
      },
    });
    const temporarilyShort = await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/roster`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { participantIds: reversed.slice(0, 7) },
    });
    expect(temporarilyShort.statusCode).toBe(200);
    const invalidLaunch = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/launch`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(invalidLaunch.statusCode).toBe(400);
    await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/roster`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { participantIds: reversed },
    });
    for (const suffix of ['launch'] as const) {
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${sessionId}/${suffix}`,
        headers: { authorization: `Bearer ${hostToken}` },
      });
    }
    for (const status of ['DRAFTING', 'DECKBUILDING'] as const) {
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${sessionId}/phase`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { status },
      });
    }
    const round = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/rounds`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(round.statusCode).toBe(201);
    const active = (round.json() as {
      session: {
        status: string;
        rounds: Array<{ matches: Array<{ tableId: string }> }>;
      };
    }).session;
    expect(active.status).toBe('ROUND_ACTIVE');
    expect(active.rounds[0]?.matches).toHaveLength(4);
    expect(
      new Set(active.rounds[0]?.matches.map((match) => match.tableId)),
    ).toEqual(new Set(tables.map((table) => table.id)));
    await app.close();
  });
});
