import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { labelsAtMerge, nextVersion, parseReleaseTags, releaseBump } from './release-version.mjs';

test('increments exactly one release component and resets smaller components', () => {
  assert.equal(nextVersion('1.1.12', 'patch'), '1.1.13');
  assert.equal(nextVersion('1.1.12', 'minor'), '1.2.0');
  assert.equal(nextVersion('1.1.12', 'major'), '2.0.0');
  assert.throws(() => nextVersion('01.1.12', 'patch'), /VERSION must be X.Y.Z/);
  assert.throws(() => nextVersion('1.1.12', 'feature'), /Unknown version bump/);
});

test('a PR defaults to patch and uses the highest selected label', () => {
  assert.deepEqual(releaseBump(['bug']), { bump: 'patch', multiple: false });
  assert.deepEqual(releaseBump(['release:minor']), { bump: 'minor', multiple: false });
  assert.deepEqual(releaseBump(['release:minor', 'release:major']), { bump: 'major', multiple: true });
});

test('uses the labels at merge, even if the PR is relabeled later', () => {
  const events = [
    { event: 'labeled', label: { name: 'release:patch' } },
    { event: 'unlabeled', label: { name: 'release:patch' } },
    { event: 'labeled', label: { name: 'release:minor' } },
    { event: 'merged' },
    { event: 'unlabeled', label: { name: 'release:minor' } },
    { event: 'labeled', label: { name: 'release:major' } },
  ];
  assert.deepEqual(labelsAtMerge(events), ['release:minor']);
  assert.equal(labelsAtMerge(events.slice(0, 3)), null);
  assert.deepEqual(labelsAtMerge([{ event: 'merged' }]), []);
});

test('matches release tags to exact commits and rejects ambiguity', () => {
  const refs = [
    'old\trefs/tags/matchmaking-baseline-v1',
    'first\trefs/tags/podyguard-v1.3.0',
    'second\trefs/tags/podyguard-v1.4.0',
    'second\trefs/tags/podyguard-v1.4.0^{}',
  ].join('\n');
  assert.deepEqual([...parseReleaseTags(refs)], [['first', '1.3.0'], ['second', '1.4.0']]);
  assert.throws(() => parseReleaseTags(`${refs}\nsecond\trefs/tags/podyguard-v1.5.0`), /Multiple release versions/);
});

test('looks up the Render release from a source directory without a Git remote', (t) => {
  const source = mkdtempSync(join(tmpdir(), 'podyguard-render-source-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  const remote = join(source, 'remote.git');
  const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
  git('init', '--bare', '--quiet', remote);
  const tree = execFileSync('git', ['--git-dir', remote, 'mktree'], { input: '', encoding: 'utf8' }).trim();
  const commit = git('--git-dir', remote, '-c', 'user.name=Release Test', '-c',
    'user.email=release@example.invalid', 'commit-tree', tree, '-m', 'Render fixture');
  git('--git-dir', remote, 'tag', 'podyguard-v1.4.0', commit);

  const script = fileURLToPath(new URL('./read-release-version.mjs', import.meta.url));
  const version = execFileSync(process.execPath, [script, commit], {
    cwd: source,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      RENDER_GIT_COMMIT: commit,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.file://${remote}.insteadOf`,
      GIT_CONFIG_VALUE_0: 'https://github.com/Tsuina311/PodyGuard.git',
    },
  });
  assert.equal(version.trim(), '1.4.0');
});
