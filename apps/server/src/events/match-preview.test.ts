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
