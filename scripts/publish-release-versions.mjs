import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import {
  labelsAtMerge,
  nextVersion,
  parseReleaseTags,
  releaseBaseline,
  releaseBump,
  releaseTagPrefix,
} from './release-version.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const api = path => JSON.parse(
  execFileSync('gh', ['api', '--paginate', '--slurp', path], { encoding: 'utf8' }),
).flat();

async function mergedLabels(commit, repository) {
  // The push can arrive before GitHub indexes its associated PR or timeline.
  // Match by merge SHA so source commits and backports cannot reuse a PR's bump.
  for (let attempt = 0; attempt < 8; attempt++) {
    const pull = api(`repos/${repository}/commits/${commit}/pulls?per_page=100`)
      .find(pr => pr.merge_commit_sha === commit && pr.merged_at);
    if (pull) {
      const timeline = api(`repos/${repository}/issues/${pull.number}/timeline?per_page=100`);
      const labels = labelsAtMerge(timeline);
      if (labels) return labels;
      if (attempt === 7) throw new Error(`Merge timeline is unavailable for PR #${pull.number}.`);
    }
    if (attempt < 7) await wait(5000);
  }
  throw new Error(`The squash-merged PR for ${commit} is unavailable. Rerun this job after GitHub finishes indexing the merge.`);
}

const commit = git('rev-parse', 'HEAD');
const history = git('rev-list', '--first-parent', commit).split('\n');
const baselineIndex = history.indexOf(releaseBaseline);
if (baselineIndex < 0) throw new Error('Release baseline is outside the main history.');

const tagged = parseReleaseTags(git('ls-remote', '--tags', 'origin', `refs/tags/${releaseTagPrefix}*`));
const checkpoint = history.slice(0, baselineIndex).findIndex(sha => tagged.has(sha));
const start = checkpoint < 0 ? baselineIndex : checkpoint;
let version = tagged.get(history[start]) ?? git('show', `${releaseBaseline}:VERSION`);
const refs = [];

for (const sha of history.slice(0, start).reverse()) {
  const { bump, multiple } = releaseBump(await mergedLabels(sha, process.env.GITHUB_REPOSITORY));
  if (multiple) console.log(`Multiple release labels for ${sha}. Using the ${bump} bump.`);
  version = nextVersion(version, bump);
  const ref = `refs/tags/${releaseTagPrefix}${version}`;
  refs.push(`${sha}:${ref}`);
  console.log(`v${version} (${bump}) → ${sha}`);
}

if (refs.length) git('push', '--atomic', 'origin', ...refs);
console.log(`Release v${version} recorded for ${commit}`);
