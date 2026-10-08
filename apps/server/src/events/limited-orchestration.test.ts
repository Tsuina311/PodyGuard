import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

async function fixture(
  mode: 'BOOSTER_DRAFT' | 'PICK_TWO_DRAFT' | 'SEALED' = 'BOOSTER_DRAFT',
  options: {
    preferredCohortSize?: number;
    allowUndersizedLaunch?: boolean;
    totalRounds?: number;
  } = {},
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
          totalRounds: options.totalRounds ?? 1,
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

async function readyAll(
  app: Awaited<ReturnType<typeof buildApp>>,
  joinCode: string,
  players: Array<{ token: string }>,
) {
  for (const player of players) {
    const ready = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${player.token}` },
      payload: { ready: true },
    });
    expect(ready.statusCode).toBe(200);
  }
}

async function claimAndSit(
  app: Awaited<ReturnType<typeof buildApp>>,
  joinCode: string,
  sessionId: string,
  players: Array<{ token: string }>,
) {
  for (const [index, player] of players.entries()) {
    const claimed = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/seat`,
      headers: { authorization: `Bearer ${player.token}` },
      payload: { seat: index + 1 },
    });
    expect(claimed.statusCode).toBe(200);
    const sat = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${sessionId}/seated`,
      headers: { authorization: `Bearer ${player.token}` },
    });
    expect(sat.statusCode).toBe(200);
  }
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

    const waiting = await app.events.getSnapshot(joinCode);
    expect(waiting.limitedSessions ?? []).toHaveLength(0);
    expect(waiting.limitedQueues).toMatchObject([
      { mode: 'BOOSTER_DRAFT', waitingCount: 8 },
    ]);
    const tooEarly = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/assign`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'BOOSTER_DRAFT' },
    });
    expect(tooEarly.statusCode).toBe(409);

    await readyAll(app, joinCode, players);
    const assigned = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/assign`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'BOOSTER_DRAFT' },
    });
    expect(assigned.statusCode).toBe(200);
    const formed = (
      assigned.json() as { session: { id: string; status: string; draftTableIds: string[] } }
    ).session;
    expect(formed).toMatchObject({ status: 'SEATING' });
    expect(formed.draftTableIds).toHaveLength(1);

    const unauthorized = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/phase`,
      headers: { authorization: `Bearer ${players[0]!.token}` },
      payload: { status: 'DRAFTING' },
    });
    expect(unauthorized.statusCode).toBe(401);
    const beforeSeats = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${formed.id}/phase`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { status: 'DRAFTING' },
    });
    expect(beforeSeats.statusCode).toBe(409);
    await claimAndSit(app, joinCode, formed.id, players);

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
    await readyAll(app, joinCode, players);
    const assigned = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/assign`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'SEALED' },
    });
    const session = (assigned.json() as { session: { id: string } }).session;
    await claimAndSit(app, joinCode, session.id, players);
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
    const lobbyReady = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${players[0]!.token}` },
      payload: { ready: true },
    });
    expect(lobbyReady.statusCode).toBe(200);
    for (const player of players.slice(1)) {
      await app.inject({
        method: 'DELETE',
        url: `/events/${joinCode}/limited/queue`,
        headers: { authorization: `Bearer ${player.token}` },
      });
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
    const created = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'BOOSTER_DRAFT', participantCount: 8 },
    });
    expect(created.statusCode).toBe(201);
    const formed = (created.json() as { session: { id: string } }).session;
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
    for (const player of players) {
      const sat = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${sessionId}/seated`,
        headers: { authorization: `Bearer ${player.token}` },
      });
      expect(sat.statusCode).toBe(200);
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

  it('runs Pick-Two from lobby ready through seat swaps, confirmations, and diagonal matches', async () => {
    const { app, joinCode, hostToken, players } = await fixture('PICK_TWO_DRAFT', {
      totalRounds: 3,
    });
    const joined = await app.events.getSnapshot(joinCode);
    expect(joined.limitedQueues?.[0]?.waitingCount).toBe(4);
    expect(joined.participants.every((person) => person.status === 'joined')).toBe(true);
    expect(joined.limitedSessions ?? []).toHaveLength(0);

    await readyAll(app, joinCode, players.slice(0, 3));
    const early = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/assign`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'PICK_TWO_DRAFT' },
    });
    expect(early.statusCode).toBe(409);

    await readyAll(app, joinCode, players.slice(3));
    const assigned = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/assign`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'PICK_TWO_DRAFT' },
    });
    expect(assigned.statusCode).toBe(200);
    const seating = (
      assigned.json() as {
        session: {
          id: string;
          status: string;
          participants: Array<{ draftSeat?: number }>;
          draftTableIds: string[];
        };
      }
    ).session;
    expect(seating.status).toBe('SEATING');
    expect(seating.draftTableIds).toHaveLength(1);
    expect(seating.participants.every((person) => person.draftSeat === undefined)).toBe(
      true,
    );

    await claimAndSit(app, joinCode, seating.id, players);
    const swapped = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${seating.id}/seat`,
      headers: { authorization: `Bearer ${players[1]!.token}` },
      payload: { seat: 1 },
    });
    expect(swapped.statusCode).toBe(200);
    const afterSwap = (
      swapped.json() as {
        session: { participants: Array<{ participantId: string; draftSeat?: number; seated?: boolean }> };
      }
    ).session;
    expect(
      afterSwap.participants.find((person) => person.participantId === players[1]!.id)
        ?.draftSeat,
    ).toBe(1);
    expect(
      afterSwap.participants.find((person) => person.participantId === players[0]!.id)
        ?.draftSeat,
    ).toBe(2);
    expect(
      afterSwap.participants
        .filter((person) => person.participantId === players[0]!.id || person.participantId === players[1]!.id)
        .every((person) => person.seated !== true),
    ).toBe(true);
    for (const player of [players[0]!, players[1]!]) {
      const sat = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${seating.id}/seated`,
        headers: { authorization: `Bearer ${player.token}` },
      });
      expect(sat.statusCode).toBe(200);
    }

    const drafting = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${seating.id}/phase`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { status: 'DRAFTING', durationSeconds: 600 },
    });
    expect(drafting.json()).toMatchObject({
      session: { status: 'DRAFTING', timer: { phase: 'DRAFTING' } },
    });
    const firstAck = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/limited/sessions/${seating.id}/ack`,
      headers: { authorization: `Bearer ${players[0]!.token}` },
    });
    expect(firstAck.json()).toMatchObject({
      session: { status: 'DRAFTING', phaseAcks: [players[0]!.id] },
    });
    for (const player of players.slice(1)) {
      const ack = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${seating.id}/ack`,
        headers: { authorization: `Bearer ${player.token}` },
      });
      expect(ack.statusCode).toBe(200);
    }
    const building = await app.events.getSnapshot(joinCode);
    expect(building.limitedSessions?.[0]?.status).toBe('DECKBUILDING');
    for (const player of players) {
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${seating.id}/ack`,
        headers: { authorization: `Bearer ${player.token}` },
      });
    }
    const playing = (await app.events.getSnapshot(joinCode)).limitedSessions?.[0];
    expect(playing?.status).toBe('ROUND_ACTIVE');
    const bySeat = new Map(
      playing?.participants.map((person) => [person.draftSeat, person.participantId]),
    );
    expect(
      playing?.rounds[0]?.matches.map((match) => [match.playerAId, match.playerBId]),
    ).toEqual([
      [bySeat.get(1), bySeat.get(3)],
      [bySeat.get(2), bySeat.get(4)],
    ]);

    for (const match of playing?.rounds[0]?.matches ?? []) {
      const reporter = players.find((player) => player.id === match.playerAId)!;
      const reported = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/limited/sessions/${seating.id}/matches/${match.id}/result`,
        headers: { authorization: `Bearer ${reporter.token}` },
        payload: {
          outcome: 'PLAYER_A_WIN',
          playerAGameWins: 1,
          playerBGameWins: 0,
        },
      });
      expect(reported.statusCode).toBe(200);
    }
    const second = (await app.events.getSnapshot(joinCode)).limitedSessions?.[0];
    expect(second?.currentRound).toBe(2);
    expect(
      second?.rounds[1]?.matches.map((match) => [match.playerAId, match.playerBId]),
    ).toEqual([
      [bySeat.get(1), bySeat.get(2)],
      [bySeat.get(3), bySeat.get(4)],
    ]);
    await app.close();
  });
});
