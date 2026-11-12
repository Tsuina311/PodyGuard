import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testUrl || testUrl === process.env.DATABASE_URL?.trim()) {
  console.error('Set TEST_DATABASE_URL to a dedicated, migrated managed test database, different from DATABASE_URL. Persistence verification did not run.');
  process.exit(1);
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.PARTICIPANT_SESSION_SECRET = 'isolated-persistence-test-secret';
const { PostgresEventStore } = await import('../apps/server/src/events/postgres-event-store.ts');
const { EventService } = await import('../apps/server/src/events/event-service.ts');
const { createIdentityBoundary } = await import('../apps/server/src/identity/index.ts');
const { closeDatabase } = await import('../apps/server/src/db/client.ts');
const { seedDemo } = await import('../e2e/demo-seed.ts');
const identity = createIdentityBoundary({ participantSessionSecret: process.env.PARTICIPANT_SESSION_SECRET });
const email = `test-${randomUUID()}@podyguard.example`;
let demo;
try {
  demo = await seedDemo(new EventService(new PostgresEventStore(), identity, { isDev: true }), email);
  await closeDatabase();
  const restored = new EventService(new PostgresEventStore(), identity, { isDev: true });
  const dashboard = await restored.getMyAccount(demo.token);
  assert.equal(dashboard.playgroups[0].id, demo.playgroup.id);
  const overview = await restored.getPlaygroupOverview(demo.token, demo.playgroup.id);
  assert.equal(overview.recordedGamesCount, 1);
  assert.equal(overview.guests.length, 4);
  for (const item of overview.guests) {
    assert.equal(item.savedDecks.length, 1);
    assert.equal(item.stats.gamesPlayed, 1);
    assert.equal(item.stats.mostPlayedWith.length, 3);
    assert.equal(item.stats.wins, item.guest.displayName === 'Ada' ? 1 : 0);
    assert.equal(item.stats.losses, item.guest.displayName === 'Ada' ? 0 : 1);
  }
  console.log('PASS: account, playgroup, four saved commanders, results and opponent statistics survive a fresh database connection.');
} finally {
  const store = new PostgresEventStore();
  const account = await store.findUserAccountByEmail(email);
  if (account) {
    for (const group of await store.listPlaygroupsByOwner(account.id)) await store.deletePlaygroup(group.id);
    await store.deleteUserAccount(account.id);
  }
  await closeDatabase();
}
