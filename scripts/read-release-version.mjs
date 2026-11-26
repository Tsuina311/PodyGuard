import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { parseReleaseTags, releaseTagPrefix } from './release-version.mjs';

const renderCommit = process.env.RENDER_GIT_COMMIT;
const commit = process.argv[2] || renderCommit || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
// Render's build source can have no configured Git remote.
const repository = renderCommit ? 'https://github.com/Tsuina311/PodyGuard.git' : 'origin';
const timeout = Date.now() + 180_000;

function readTags() {
  try {
    return execFileSync(
      'git',
      ['ls-remote', '--tags', repository, `refs/tags/${releaseTagPrefix}*`],
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
