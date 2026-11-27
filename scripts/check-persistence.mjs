import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testUrl || testUrl === process.env.DATABASE_URL?.trim()) {
  console.error(
    'Set TEST_DATABASE_URL to a dedicated, migrated managed test database, different from DATABASE_URL. Persistence verification did not run.',
  );
  process.exit(1);
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.PARTICIPANT_SESSION_SECRET = 'isolated-persistence-test-secret';
const { PostgresEventStore } = await import(
  '../apps/server/src/events/postgres-event-store.ts'
);
const { EventService } = await import(
  '../apps/server/src/events/event-service.ts'
);
const { createIdentityBoundary } = await import(
  '../apps/server/src/identity/index.ts'
);
const { closeDatabase } = await import('../apps/server/src/db/client.ts');
const { seedDemo } = await import('../e2e/demo-seed.ts');
const identity = createIdentityBoundary({
  participantSessionSecret: process.env.PARTICIPANT_SESSION_SECRET,
});
const email = `test-${randomUUID()}@podyguard.example`;
let demo;
let transferSessionId;
try {
  demo = await seedDemo(
    new EventService(new PostgresEventStore(), identity, { isDev: true }),
    email,
  );
  await closeDatabase();
  const restored = new EventService(new PostgresEventStore(), identity, {
    isDev: true,
  });
  const dashboard = await restored.getMyAccount(demo.token);
  assert.equal(dashboard.playgroups[0].id, demo.playgroup.id);
  const overview = await restored.getPlaygroupOverview(
    demo.token,
    demo.playgroup.id,
  );
  assert.equal(overview.recordedGamesCount, 1);
  assert.equal(overview.guests.length, 4);
  for (const item of overview.guests) {
    assert.equal(item.savedDecks.length, 1);
    assert.equal(item.stats.gamesPlayed, 1);
    assert.equal(item.stats.mostPlayedWith.length, 3);
    assert.equal(item.stats.wins, item.guest.displayName === 'Ada' ? 1 : 0);
    assert.equal(item.stats.losses, item.guest.displayName === 'Ada' ? 0 : 1);
  }
  console.log(
    'PASS: account, playgroup, four saved commanders, results and opponent statistics survive a fresh database connection.',
  );

  // Real transaction/concurrency checks. All rows belong to this run's account.
  const store = new PostgresEventStore();
  const service = new EventService(store, identity, { isDev: true });
  const { event } = await service.createEvent(
    {
      name: 'Isolated persistence night',
      hostPin: '2468',
      tableCount: 2,
      playgroupId: demo.playgroup.id,
    },
    demo.token,
  );
  const tables = await store.listTables(event.id);
  const layoutEvent = await service.createEvent({
    name: 'Isolated physical table layout', hostPin: '2468', tableCount: 1,
    gameMode: 'commander', allowThreePods: true, allowFivePods: false,
    tableLayouts: [{ shape: 'rectangle', seats: 7 }],
  }, demo.token);
  await closeDatabase();
  const restoredAreas = await new PostgresEventStore().listTables(layoutEvent.event.id);
  assert.deepEqual(restoredAreas.map(table => [table.label, table.area?.tableNumber, table.area?.part, table.area?.seats]), [
    ['Table 1 · Part A', 1, 'A', 4], ['Table 1 · Part B', 1, 'B', 3],
  ]);
  const { PostgresEventTrackerStore } = await import('../apps/server/src/event-tracker/store.ts');
  const trackers = new PostgresEventTrackerStore();
  const trackerContext = `${event.id}:persistence-check`;
  const trackerId = randomUUID();
  await trackers.exclusive(trackerContext, () => trackers.put({
    context: trackerContext, id: trackerId, gameId: randomUUID(), eventId: event.id,
    readToken: 'a'.repeat(64), ownerId: 'owner-a', ownerName: 'Ada', deviceId: randomUUID(),
    generation: 1, revision: 0, updatedAt: Date.now(), transfer: null,
    history: { present: { players: [{ id: 'a', life: 17 }], firstPlayerId: 'a' }, past: [{ players: [{ id: 'a', life: 20 }] }] },
  }));
  const ownership = await Promise.all([1, 2].map(() => trackers.exclusive(trackerContext, async () => {
    const row = await trackers.get(trackerContext);
    if (row.generation !== 1) return false;
    await trackers.put({ ...row, ownerId: 'owner-b', generation: 2 });
    return true;
  })));
  assert.equal(ownership.filter(Boolean).length, 1);
  await closeDatabase();
  const persistedTracker = await new PostgresEventTrackerStore().getById(trackerId);
  assert.equal(persistedTracker.ownerId, 'owner-b');
  assert.equal(persistedTracker.generation, 2);
  assert.equal(persistedTracker.history.present.players[0].life, 17);
  assert.equal(persistedTracker.history.past[0].players[0].life, 20);
  console.log('PASS: event tracker ownership, state and undo survive reconnect; concurrent ownership changes serialize.');
  const ownerA = randomUUID(),
    ownerB = randomUUID();
  const claims = await Promise.allSettled(
    [ownerA, ownerB].map((ownerId) =>
      store.claimTable({
        eventId: event.id,
        tableId: tables[0].id,
        ownerType: 'ROUND_ASSIGNMENT',
        ownerId,
        purpose: 'ROUND',
      }),
    ),
  );
  assert.equal(claims.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(claims.filter((r) => r.status === 'rejected').length, 1);
  const [reservation] = await store.listActiveTableReservations(event.id);
  assert.equal(
    await store.releaseTableIfOwned({
      tableId: tables[0].id,
      ownerType: 'ROUND_ASSIGNMENT',
      ownerId: 'stale-owner',
    }),
    false,
  );
  await closeDatabase();
  const reconnected = new PostgresEventStore();
  assert.equal(
    (await reconnected.listActiveTableReservations(event.id))[0].ownerId,
    reservation.ownerId,
  );
  assert.equal(
    await reconnected.releaseTableIfOwned({
      tableId: tables[0].id,
      ownerType: 'ROUND_ASSIGNMENT',
      ownerId: reservation.ownerId,
    }),
    true,
  );

  await assert.rejects(() =>
    reconnected.createPod({
      eventId: event.id,
      tableId: tables[0].id,
      poolId: 'b3',
      seats: [
        {
          participantId: randomUUID(),
          deckId: randomUUID(),
          assignedPoolId: 'b3',
        },
      ],
    }),
  );
  assert.equal((await reconnected.findTableById(tables[0].id)).status, 'free');
  assert.equal(
    (await reconnected.listActiveTableReservations(event.id)).length,
    0,
  );
  const seats = [];
  for (const name of ['One', 'Two', 'Three', 'Four']) {
    const participant = await reconnected.insertParticipant({
      eventId: event.id,
      displayName: name,
    });
    const [deck] = await reconnected.replaceDecks(participant.id, [
      {
        participantId: participant.id,
        name: null,
        poolId: 'b3',
        preference: 'preferred',
        commanders: [],
      },
    ]);
    seats.push({
      participantId: participant.id,
      deckId: deck.id,
      assignedPoolId: 'b3',
    });
  }
  const pod = await reconnected.createPod({
    eventId: event.id,
    tableId: tables[0].id,
    poolId: 'b3',
    seats,
  });
  await reconnected.startPod(pod.id);
  await closeDatabase();
  const fresh = new PostgresEventStore();
  assert.equal((await fresh.listAssignments(event.id)).length, 4);
  assert.equal(
    (await fresh.findActivePodByTableId(event.id, tables[0].id)).status,
    'playing',
  );
  const completions = await Promise.allSettled(
    [1, 2].map(() =>
      fresh.completePod(pod.id, {
        winnerParticipantId: seats[0].participantId,
      }),
    ),
  );
  assert.equal(completions.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await fresh.listMatchHistory(event.id)).length, 1);
  assert.equal((await fresh.listCompletedGames(event.id)).length, 1);
  assert.equal((await fresh.findTableById(tables[0].id)).status, 'free');
  assert.equal((await fresh.listActiveTableReservations(event.id)).length, 0);

  const { PostgresGameNightStore } = await import(
    '../apps/server/src/game-nights/store.ts'
  );
  const nightStore = new PostgresGameNightStore();
  const night = await nightStore.create(demo.playgroup.id, {
    name: 'Database night',
    startsAt: new Date(Date.now() + 86400_000).toISOString(),
    timeZone: 'Europe/Paris',
    location: '',
    seatTarget: 4,
    agreement: { pace: 'relaxed' },
  });
  await Promise.all(
    ['yes', 'maybe'].map((response) =>
      nightStore.rsvp(night.id, 'fixture-hash', {
        displayName: 'Ada',
        response,
      }),
    ),
  );
  await closeDatabase();
  assert.equal(
    (await new PostgresGameNightStore().get(night.id)).agreement.pace,
    'relaxed',
  );
  assert.equal((await new PostgresGameNightStore().rsvps(night.id)).length, 1);
  console.log(
    'PASS: concurrent table claims, rollback, stale release, active-event reconnect, single completion and game-night persistence.',
  );
  const { PostgresLinkTransferStore } = await import('../apps/server/src/link-transfer/store.ts');
  const { LinkTransferService } = await import('../apps/server/src/link-transfer/service.ts');
  const senderA = new LinkTransferService(new PostgresLinkTransferStore());
  const senderB = new LinkTransferService(new PostgresLinkTransferStore());
  const transfer = await senderA.create();
  transferSessionId = transfer.id;
  const submissions = await Promise.all([
    senderA.send(transfer.id, transfer.sendToken, '/tools?q=Sol%20Ring#card'),
    senderB.send(transfer.id, transfer.sendToken, '/display/event/ABCD12'),
  ]);
  assert.equal(submissions.filter(result => result.accepted).length, 1);
  await closeDatabase();
  const receiver = new LinkTransferService(new PostgresLinkTransferStore());
  const accepted = await receiver.receive(transfer.id, transfer.receiveToken);
  assert.equal(accepted.destination, submissions[0].accepted ? '/tools?q=Sol%20Ring#card' : '/display/event/ABCD12');
  assert.deepEqual(await receiver.receive(transfer.id, transfer.receiveToken), accepted);
  assert.deepEqual(await receiver.send(transfer.id, transfer.sendToken, '/tools'), { accepted: false });
  console.log('PASS: transfer first-writer arbitration and retained results across independent PostgreSQL connections.');
} finally {
  if (transferSessionId) {
    const { getDb } = await import('../apps/server/src/db/client.ts');
    const { linkTransfers } = await import('../apps/server/src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    await getDb().delete(linkTransfers).where(eq(linkTransfers.id, transferSessionId));
  }
  const store = new PostgresEventStore();
  const account = await store.findUserAccountByEmail(email);
  if (account) {
    const { getDb } = await import('../apps/server/src/db/client.ts');
    const { events } = await import('../apps/server/src/db/schema.ts');
    const { eq } = await import('drizzle-orm');
    await getDb().delete(events).where(eq(events.ownerUserId, account.id));
    for (const group of await store.listPlaygroupsByOwner(account.id))
      await store.deletePlaygroup(group.id);
    await store.deleteUserAccount(account.id);
  }
  await closeDatabase();
}
