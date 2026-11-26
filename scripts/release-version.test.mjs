import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextVersion, releasePlan } from './release-version.mjs';

test('increments one release component and resets smaller components', () => {
  assert.equal(nextVersion('1.1.12', 'patch'), '1.1.13');
  assert.equal(nextVersion('1.1.12', 'minor'), '1.2.0');
  assert.equal(nextVersion('1.1.12', 'major'), '2.0.0');
  assert.throws(() => nextVersion('01.1.12', 'patch'), /VERSION must be X.Y.Z/);
  assert.throws(() => nextVersion('1.1.12', 'feature'), /Unknown version bump/);
});

const plan = (overrides = {}) => releasePlan({
  baseVersion: '1.2.1',
  proposedVersion: '1.2.2',
  labels: [],
  changedPaths: [],
  draft: false,
  ...overrides,
});

test('uses patch by default and honors one explicit release label', () => {
  assert.deepEqual(plan({ labels: ['bug'] }), { bump: 'patch', pendingLabel: null });
  assert.deepEqual(plan({ labels: ['release:minor'], proposedVersion: '1.3.0' }), { bump: 'minor', pendingLabel: null });
  assert.deepEqual(plan({ labels: ['release:major'], proposedVersion: '2.0.0' }), { bump: 'major', pendingLabel: null });
  assert.throws(() => plan({ labels: ['release:patch', 'release:minor'] }), /Choose exactly one/);
  assert.throws(() => plan({ labels: ['release:minor'] }), /Expected VERSION 1\.3\.0.*yarn bump:minor/);
  assert.throws(() => plan({ proposedVersion: '1.5.0', draft: true }), /Expected VERSION 1\.2\.2/);
});

test('identifies which owner label a valid minor or major proposal needs', () => {
  for (const [bump, proposedVersion] of [['minor', '1.3.0'], ['major', '2.0.0']]) {
    const pendingLabel = `release:${bump}`;
    assert.deepEqual(plan({ proposedVersion, draft: true }), { bump, pendingLabel });
    assert.throws(() => plan({ proposedVersion }), new RegExp(`Add the ${pendingLabel} label`));
  }
});

test('requires an explicit decision for compatibility-sensitive paths', () => {
  for (const path of [
    'apps/server/drizzle/0031_example.sql',
    'apps/server/src/db/schema.ts',
    'apps/web/src/player-sessions.ts',
    'packages/shared/src/event-api.ts',
  ]) {
    assert.throws(() => plan({ changedPaths: [path] }), /Add the release:patch label[\s\S]*Review compatibility/);
    assert.deepEqual(plan({ changedPaths: [path], draft: true }), { bump: 'patch', pendingLabel: 'release:patch' });
    assert.deepEqual(plan({ labels: ['release:patch'], changedPaths: [path] }), { bump: 'patch', pendingLabel: null });
  }
});
