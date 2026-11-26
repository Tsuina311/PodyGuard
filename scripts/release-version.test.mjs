import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextVersion, releaseBump } from './release-version.mjs';

test('increments one release component and resets smaller components', () => {
  assert.equal(nextVersion('1.1.12', 'patch'), '1.1.13');
  assert.equal(nextVersion('1.1.12', 'minor'), '1.2.0');
  assert.equal(nextVersion('1.1.12', 'major'), '2.0.0');
  assert.throws(() => nextVersion('01.1.12', 'patch'), /VERSION must be X.Y.Z/);
  assert.throws(() => nextVersion('1.1.12', 'feature'), /Unknown version bump/);
});

test('uses patch by default and honors one explicit release label', () => {
  assert.equal(releaseBump(['bug'], ['apps/web/src/HomePage.tsx']), 'patch');
  assert.equal(releaseBump(['release:minor'], []), 'minor');
  assert.equal(releaseBump(['release:major'], []), 'major');
  assert.throws(() => releaseBump(['release:patch', 'release:minor'], []), /Choose exactly one/);
});

test('requires an explicit decision for compatibility-sensitive paths', () => {
  for (const path of [
    'apps/server/drizzle/0031_example.sql',
    'apps/server/src/db/schema.ts',
    'apps/web/src/player-sessions.ts',
    'packages/shared/src/event-api.ts',
  ]) {
    assert.throws(() => releaseBump([], [path]), /Review compatibility/);
    assert.equal(releaseBump(['release:patch'], [path]), 'patch');
  }
});
