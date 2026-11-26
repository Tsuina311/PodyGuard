import { appendFileSync, readFileSync } from 'node:fs';
import { releaseBump } from './release-version.mjs';

const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const { bump, multiple } = releaseBump(pr.labels.map(label => label.name));
const message = [
  `Selected bump is **${bump}**. The release number is assigned automatically when this PR is squash-merged.`,
  ...(multiple ? ['Several release labels are present. The highest bump takes precedence.'] : []),
].join('\n\n');

console.log(message);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Release version\n\n${message}\n`);
}
