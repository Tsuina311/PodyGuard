import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { nextVersion, releaseBump } from './release-version.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

try {
  const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const baseRef = `refs/remotes/origin/${pr.base.ref}`;
  const base = git('rev-parse', baseRef).trim();
  const head = pr.head.sha;
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', base, head]);
  if (ancestor.status === 1) {
    throw new Error(`Update this PR from ${pr.base.ref} and recalculate VERSION before merging.`);
  }
  if (ancestor.status !== 0) throw new Error('Could not compare the PR with the base branch.');

  const changedPaths = git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter(Boolean);
  const bump = releaseBump(pr.labels.map(label => label.name), changedPaths);
  const baseVersion = git('show', `${base}:VERSION`).trim();
  const proposedVersion = git('show', `${head}:VERSION`).trim();
  const expectedVersion = nextVersion(baseVersion, bump);
  if (proposedVersion !== expectedVersion) {
    throw new Error(
      `Expected VERSION ${expectedVersion} for a ${bump} bump from ${baseVersion}, got ${proposedVersion}. ` +
      `Run yarn bump:${bump} against the latest ${pr.base.ref} and commit VERSION.`,
    );
  }
  console.log(`Release version check passed (${bump}): ${baseVersion} → ${proposedVersion}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
