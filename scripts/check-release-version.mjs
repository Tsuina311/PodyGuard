import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { nextVersion, releasePlan } from './release-version.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

function summarize(message) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `## Release version\n\n${message}\n`);
}

try {
  const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const baseRef = `refs/remotes/origin/${pr.base.ref}`;
  const base = git('rev-parse', baseRef).trim();
  const head = pr.head.sha;
  const branchBase = git('merge-base', base, head).trim();
  const behind = branchBase !== base;
  const mainVersion = git('show', `${base}:VERSION`).trim();

  const changedPaths = git('diff', '--name-only', '--no-renames', '-z', branchBase, head).split('\0').filter(Boolean);
  const baseVersion = behind ? git('show', `${branchBase}:VERSION`).trim() : mainVersion;
  const proposedVersion = git('show', `${head}:VERSION`).trim();
  const { bump, pendingLabel } = releasePlan({
    labels: pr.labels.map(label => label.name),
    changedPaths,
    baseVersion,
    proposedVersion,
    draft: pr.draft || behind,
  });
  const update = behind
    ? `This branch is behind ${pr.base.ref} (${mainVersion}). Update the branch and run yarn bump:${bump} to propose ${nextVersion(mainVersion, bump)}.`
    : null;
  if (update && !pr.draft) throw new Error(update);

  const message = [
    `${pr.draft ? 'Draft preview' : 'Release version check passed'} (${bump}): ${baseVersion} → ${proposedVersion}`,
    ...(pendingLabel ? [`Owner approval pending. Add ${pendingLabel} before merging.`] : []),
    ...(update ? [update] : []),
  ].join('\n\n');
  console.log(message);
  summarize(message);
} catch (error) {
  console.error(error.message);
  summarize(error.message);
  process.exitCode = 1;
}
