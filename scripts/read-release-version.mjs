import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { parseReleaseTags, releaseTagPrefix } from './release-version.mjs';

const commit = process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const timeout = Date.now() + 180_000;

function readTags() {
  try {
    return execFileSync(
      'git',
      ['ls-remote', '--tags', 'origin', `refs/tags/${releaseTagPrefix}*`],
      { encoding: 'utf8', timeout: 10_000 },
    );
  } catch (error) {
    console.error(`Release tag lookup will retry: ${error.message}`);
    return '';
  }
}

do {
  const version = parseReleaseTags(readTags()).get(commit);
  if (version) {
    console.log(version);
    process.exit(0);
  }
  await wait(5000);
} while (Date.now() < timeout);

throw new Error(`Release version for ${commit} has not been published yet. Check the Release version workflow.`);
