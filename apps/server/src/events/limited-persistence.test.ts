import { describe, expect, it } from 'vitest';
import {
  LimitedPersistenceConflictError,
  type NewStoredLimitedSession,
} from './event-store.js';
import { MemoryEventStore } from './memory-event-store.js';

async function fixture() {
  const store = new MemoryEventStore();
  const event = await store.insertEvent({
    name: 'Limited Night',
    joinCode: 'LIMIT1',
    hostCredentialHash: 'hash',
  });
  const players = await Promise.all(
    ['Ada', 'Bea', 'Cy'].map((displayName) =>
      store.insertParticipant({ eventId: event.id, displayName }),
    ),
  );
  const tables = await Promise.all(
    [1, 2].map((number) =>
      store.insertTable({
        eventId: event.id,
        label: `Table ${number}`,
        sortOrder: number,
      }),
    ),
  );
  return { store, event, players, tables };
}

function sessionInput(
  eventId: string,
  participantIds: string[],
  draftTableIds: string[],
): NewStoredLimitedSession {
  return {
    eventId,
    mode: 'BOOSTER_DRAFT',
    label: 'Draft A',
    matchStructure: 'BO3',
    pairingPolicy: 'SWISS',
    preferredCohortSize: 8,
    minCohortSize: 8,
    maxCohortSize: 8,
    allowUndersizedLaunch: false,
    totalRounds: 3,
    participants: participantIds.map((participantId, index) => ({
      participantId,
      draftSeat: index + 1,
    })),
    draftTableIds,
  };
}

describe('Limited persistence lifecycle', () => {
  it('prevents table collisions and releases resources on completion', async () => {
    const { store, event, players, tables } = await fixture();
    const session = await store.createLimitedSession(
      sessionInput(
        event.id,
        players.map((player) => player.id),
        [tables[0]!.id],
      ),
    );
    expect((await store.findTableById(tables[0]!.id))?.status).toBe('occupied');
    await store.replaceLimitedDraftTables(session.id, [tables[1]!.id]);
    expect((await store.findTableById(tables[0]!.id))?.status).toBe('free');
    expect((await store.findTableById(tables[1]!.id))?.status).toBe('occupied');

    await expect(
      store.createLimitedSession(
        sessionInput(event.id, [players[0]!.id], [tables[1]!.id]),
      ),
    ).rejects.toBeInstanceOf(LimitedPersistenceConflictError);

    await store.updateLimitedSessionPhase(session.id, {
      status: 'DECKBUILDING',
    });
    const round = await store.createLimitedRound({
      sessionId: session.id,
      number: 1,
      status: 'ACTIVE',
      matches: [
        {
          position: 1,
          playerAId: players[0]!.id,
          playerBId: players[1]!.id,
          tableId: tables[0]!.id,
          bestOf: 3,
        },
        {
          position: 2,
          playerAId: players[2]!.id,
          bestOf: 3,
          outcome: 'BYE',
          playerAGameWins: 1,
          playerBGameWins: 0,
        },
      ],
    });
    const match = round.matches[0]!;
    const finalized = await store.finalizeLimitedMatchResult({
      matchId: match.id,
      outcome: 'PLAYER_A_WIN',
      playerAGameWins: 2,
      playerBGameWins: 0,
    });
    expect(finalized.corrected).toBe(false);
    expect(finalized.audit.previousOutcome).toBeNull();
    expect((await store.findTableById(tables[0]!.id))?.status).toBe('free');

    await expect(
      store.finalizeLimitedMatchResult({
        matchId: match.id,
        outcome: 'PLAYER_B_WIN',
        playerAGameWins: 1,
        playerBGameWins: 2,
      }),
    ).rejects.toThrow('correction reason');
    const corrected = await store.finalizeLimitedMatchResult({
      matchId: match.id,
      outcome: 'PLAYER_B_WIN',
      playerAGameWins: 1,
      playerBGameWins: 2,
      correctionReason: 'Score entered backwards',
    });
    expect(corrected.corrected).toBe(true);
    expect(corrected.audit.previousOutcome).toBe('PLAYER_A_WIN');

    await store.updateLimitedRound(round.id, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
    const newcomer = await store.insertParticipant({
      eventId: event.id,
      displayName: 'Di',
    });
    await expect(
      store.createLimitedSession(
        sessionInput(event.id, [newcomer.id], [tables[0]!.id]),
      ),
    ).resolves.toMatchObject({ draftTableIds: [tables[0]!.id] });

    const completed = await store.finishLimitedSession(
      session.id,
      'COMPLETED',
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.participants.map((row) => row.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
    ]);
  });

  it('rejects duplicate membership, seats, rounds, and round appearances', async () => {
    const { store, event, players } = await fixture();
    await expect(
      store.createLimitedSession({
        ...sessionInput(event.id, [players[0]!.id, players[0]!.id], []),
      }),
    ).rejects.toBeInstanceOf(LimitedPersistenceConflictError);
    await expect(
      store.createLimitedSession({
        ...sessionInput(event.id, [players[0]!.id, players[1]!.id], []),
        participants: [
          { participantId: players[0]!.id, draftSeat: 1 },
          { participantId: players[1]!.id, draftSeat: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(LimitedPersistenceConflictError);

    const session = await store.createLimitedSession(
      sessionInput(
        event.id,
        players.map((player) => player.id),
        [],
      ),
    );
    await expect(
      store.createLimitedRound({
        sessionId: session.id,
        number: 1,
        matches: [
          {
            position: 1,
            playerAId: players[0]!.id,
            playerBId: players[1]!.id,
            bestOf: 1,
          },
          {
            position: 2,
            playerAId: players[0]!.id,
            playerBId: players[2]!.id,
            bestOf: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(LimitedPersistenceConflictError);
  });

  it('atomically replaces a forming roster and requeues removed players', async () => {
    const { store, event, players } = await fixture();
    const session = await store.createLimitedSession(
      sessionInput(
        event.id,
        players.map((player) => player.id),
        [],
      ),
    );
    const newcomer = await store.insertParticipant({
      eventId: event.id,
      displayName: 'Di',
    });
    const updated = await store.replaceLimitedSessionRoster(session.id, [
      { participantId: players[1]!.id, draftSeat: 1 },
      { participantId: newcomer.id, draftSeat: 2 },
      { participantId: players[0]!.id, draftSeat: 3 },
    ]);
    expect(
      updated.participants.map((participant) => [
        participant.participantId,
        participant.draftSeat,
      ]),
    ).toEqual([
      [players[1]!.id, 1],
      [newcomer.id, 2],
      [players[0]!.id, 3],
    ]);
    expect(await store.findParticipantById(players[2]!.id)).toMatchObject({
      status: 'joined',
      limitedQueueMode: 'BOOSTER_DRAFT',
    });
    expect(await store.findParticipantById(newcomer.id)).toMatchObject({
      status: 'matched',
      limitedQueueMode: null,
    });
  });
});
