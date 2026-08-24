import { describe, expect, it } from 'vitest';
import type { CommanderSelection } from '@podyguard/shared';
import { buildApp } from '../app.js';
import { createIdentityBoundary } from '../identity/index.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';

const commander = (name: string): CommanderSelection => ({
  oracleId: `oracle-${name}`,
  cardId: `card-${name}`,
  name,
  artCropUri: `https://cards.example/${name}.jpg`,
  typeLine: 'Legendary Creature',
  oracleText: `${name} rules text`,
  keywords: ['Flying'],
});

function setup() {
  const store = new MemoryEventStore();
  const identity = createIdentityBoundary({
    participantSessionSecret: 'test-secret',
  });
  const events = new EventService(store, identity);
  return { events, identity, store };
}

describe('commander registration metadata', () => {
  it('persists commanders and reports those on the exact assigned deck', async () => {
    const { events, store } = setup();
    const created = await events.createEvent({
      name: 'Commander Night',
      hostPin: '2468',
      tableCount: 1,
    });
    const preferred = commander('Preferred');
    const assigned = commander('Assigned');
    const joined = await events.joinEvent(created.event.joinCode, 'Alex', [
      {
        name: 'Preferred deck',
        poolId: 'b2',
        preference: 'preferred',
        commanders: [preferred],
      },
      {
        name: 'Assigned deck',
        poolId: 'b3',
        preference: 'accepted',
        commanders: [assigned],
      },
    ]);
    const assignedDeck = joined.participant.decks[1];
    const table = (await store.listTables(created.event.id))[0];
    expect(assignedDeck).toBeDefined();
    expect(table).toBeDefined();
    await store.createPod({
      eventId: created.event.id,
      tableId: table!.id,
      poolId: 'b3',
      seats: [
        {
          participantId: joined.participant.id,
          deckId: assignedDeck!.id,
          assignedPoolId: 'b3',
        },
      ],
    });

    const me = await events.getMe(created.event.joinCode, joined.token);
    expect(me.participant.decks[0]?.commanders).toEqual([preferred]);
    expect(me.participant.assignedDeckName).toBe('Assigned deck');
    expect(me.participant.assignedCommanders).toEqual([assigned]);
  });

  it('accepts omitted commanders and rejects unsafe commander fields', async () => {
    const { events, identity } = setup();
    const app = await buildApp({ events, identity, logger: false });
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Commander Night', hostPin: '2468', tableCount: 1 },
    });
    const joinCode = (created.json() as { event: { joinCode: string } }).event
      .joinCode;

    const legacy = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: {
        displayName: 'Legacy',
        decks: [{ poolId: 'open', preference: 'preferred' }],
      },
    });
    expect(legacy.statusCode).toBe(201);
    expect(legacy.json()).toMatchObject({
      participant: { decks: [{ commanders: [] }], assignedCommanders: [] },
    });

    const tooMany = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: {
        displayName: 'Unsafe',
        decks: [
          {
            poolId: 'open',
            commanders: [
              commander('One'),
              commander('Two'),
              commander('Three'),
            ],
          },
        ],
      },
    });
    expect(tooMany.statusCode).toBe(400);

    const badUrl = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: {
        displayName: 'Unsafe URL',
        decks: [
          {
            poolId: 'open',
            commanders: [{ ...commander('Bad'), artCropUri: 'javascript:bad' }],
          },
        ],
      },
    });
    expect(badUrl.statusCode).toBe(400);
    await app.close();
  });
});
