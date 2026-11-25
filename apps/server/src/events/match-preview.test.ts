import { describe, expect, it } from 'vitest';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

describe('matching explanations', () => {
  it('previews the actual matcher without claiming a table or changing readiness', async () => {
    const store = new MemoryEventStore();
    const service = new EventService(
      store,
      createIdentityBoundary({ participantSessionSecret: 'preview' }),
      { isDev: true },
    );
    const { event, hostToken } = await service.createEvent({
      name: 'Friends',
      hostPin: '2468',
      tableCount: 1,
    });
    for (let i = 0; i < 6; i += 1) {
      const person = await store.insertParticipant({
        eventId: event.id,
        displayName: `Player ${i}`,
        status: 'ready',
        readyAt: new Date(Date.now() - 120_000),
      });
      await store.replaceDecks(person.id, [
        {
          participantId: person.id,
          name: null,
          poolId: 'b3',
          preference: 'preferred',
          commanders: [],
        },
      ]);
    }
    const before = await service.getSnapshot(event.joinCode);
    const preview = await service.previewMatches(event.joinCode, hostToken);
    expect(preview.pods).toHaveLength(1);
    expect(preview.pods[0]?.repeatPairs).toBe(0);
    expect(preview.pods[0]?.longestWaitSeconds).toBeGreaterThanOrEqual(120);
    expect(
      preview.waiting.length +
        preview.pods.reduce((n, p) => n + p.playerNames.length, 0),
    ).toBe(6);
    expect(preview.waiting.every((p) => p.reason === 'NO_FREE_TABLE')).toBe(
      true,
    );
    expect(await service.getSnapshot(event.joinCode)).toEqual(before);
    const formed = await service.matchNow(event.joinCode, hostToken);
    expect(formed.pods.map((p) => p.playerNames)).toEqual(
      preview.pods.map((p) => p.playerNames),
    );
  });
  it('reports compatibility shortages and rejects non-host access', async () => {
    const store = new MemoryEventStore();
    const service = new EventService(
      store,
      createIdentityBoundary({ participantSessionSecret: 'preview' }),
    );
    const { event, hostToken } = await service.createEvent({
      name: 'Friends',
      hostPin: '2468',
      tableCount: 1,
    });
    const person = await store.insertParticipant({
      eventId: event.id,
      displayName: 'Ada',
      status: 'ready',
      readyAt: new Date(),
    });
    await store.replaceDecks(person.id, [
      {
        participantId: person.id,
        name: null,
        poolId: 'b3',
        preference: 'preferred',
        commanders: [],
      },
    ]);
    expect(
      (await service.previewMatches(event.joinCode, hostToken)).waiting,
    ).toEqual([{ displayName: 'Ada', reason: 'NO_COMPATIBLE_POD' }]);
    await expect(
      service.previewMatches(event.joinCode, 'wrong'),
    ).rejects.toThrow();
  });
});
it('accepts only one concurrent completion and counts a rematch accurately', async () => {
  const store = new MemoryEventStore();
  const service = new EventService(
    store,
    createIdentityBoundary({ participantSessionSecret: 'preview' }),
  );
  const { event, hostToken } = await service.createEvent({
    name: 'Friends',
    hostPin: '2468',
    tableCount: 1,
  });
  await service.updateMatchSettings(event.joinCode, hostToken, {
    preferredPodSize: 4,
    allowThreePods: false,
    allowFivePods: false,
  });
  const people: Array<{ id: string }> = [];
  for (let i = 0; i < 4; i += 1) {
    const person = await store.insertParticipant({
      eventId: event.id,
      displayName: `Player ${i}`,
      status: 'ready',
      readyAt: new Date(),
    });
    await store.replaceDecks(person.id, [
      {
        participantId: person.id,
        name: null,
        poolId: 'b3',
        preference: 'preferred',
        commanders: [],
      },
    ]);
    people.push(person);
  }
  const match = await service.matchNow(event.joinCode, hostToken);
  const pod = match.pods[0]!;
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      store.completePod(pod.id, { winnerParticipantId: people[0]!.id }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await store.listMatchHistory(event.id)).toHaveLength(1);
  const preview = await service.previewMatches(event.joinCode, hostToken);
  expect(preview.pods[0]?.repeatPairs).toBe(6);
});

it('uses the selected mix of Commander table sizes from event creation', async () => {
  const store = new MemoryEventStore();
  const service = new EventService(store, createIdentityBoundary({ participantSessionSecret: 'preview' }));
  const { event, hostToken } = await service.createEvent({
    name: 'Mixed tables', hostPin: '2468', tableCount: 2,
    preferredPodSize: 4, allowThreePods: true, allowFivePods: false,
  });
  expect(event).toMatchObject({ allowThreePods: true, allowFivePods: false });
  for (let i = 0; i < 7; i += 1) {
    const person = await store.insertParticipant({
      eventId: event.id, displayName: `Player ${i}`, status: 'ready', readyAt: new Date(),
    });
    await store.replaceDecks(person.id, [{
      participantId: person.id, name: null, poolId: 'b3', preference: 'preferred', commanders: [],
    }]);
  }
  const preview = await service.previewMatches(event.joinCode, hostToken);
  expect(preview.pods.map(pod => pod.playerNames.length).sort()).toEqual([3, 4]);
});

it('starts each continuation of a best-of-three on a fresh game and settles at two wins', async () => {
  const service = new EventService(
    new MemoryEventStore(),
    createIdentityBoundary({ participantSessionSecret: 'series' }),
  );
  const { event, hostToken } = await service.createEvent({
    name: 'Best of three', hostPin: '2468', tableCount: 1, gameMode: 'duel',
    tournamentFormat: 'swiss', tournamentOptions: { defaultBestOf: 3, swissRounds: 1 },
  });
  const code = event.joinCode;
  const ada = await service.joinEvent(code, 'Ada');
  const bea = await service.joinEvent(code, 'Bea');
  await service.setReady(code, ada.token, true);
  await service.setReady(code, bea.token, true);
  await service.startTournament(code, hostToken);
  const [table] = await service.listTables(code);
  const first = await service.startTable(code, hostToken, table!.id);
  const participant = await service.reportGameResult(code, ada.token, {
    winnerParticipantId: ada.participant.id, expectedGameId: first.gameId!,
  });
  expect(participant).toMatchObject({ status: 'playing', tableLabel: table!.label });
  const afterFirst = await service.getSnapshot(code);
  const second = afterFirst.tables[0]!;
  expect(second).toMatchObject({ podStatus: 'playing' });
  expect(second.gameId).not.toBe(first.gameId);
  const match = afterFirst.event.tournament!.rounds[0]!.matches[0]!;
  expect(match.seriesWins?.[ada.participant.id]).toBe(1);
  await expect(service.reportGameResult(code, ada.token, {
    winnerParticipantId: ada.participant.id, expectedGameId: first.gameId!,
  })).rejects.toThrow('This game has changed');

  // A host report and a tracker report use the same continuation path.
  await service.reportTournamentResult(code, hostToken, match.id, bea.participant.id, second.gameId!);
  await expect(service.reportTournamentResult(code, hostToken, match.id, bea.participant.id, second.gameId!))
    .rejects.toThrow('This game has changed');
  const [third] = await service.listTables(code);
  expect(third).toMatchObject({ podStatus: 'playing' });
  expect(third!.gameId).not.toBe(second.gameId);
  await service.reportGameResult(code, ada.token, {
    winnerParticipantId: ada.participant.id, expectedGameId: third!.gameId!,
  });
  const done = await service.getSnapshot(code);
  expect(done.tables[0]?.status).toBe('free');
  expect(done.event.tournament!.rounds[0]!.matches[0]).toMatchObject({
    status: 'completed',
    winnerParticipantId: ada.participant.id,
    seriesWins: { [ada.participant.id]: 2, [bea.participant.id]: 1 },
  });
});
