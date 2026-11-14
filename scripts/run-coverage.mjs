import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
const tasks = [
  [
    'web',
    ['src/offline-queue.test.ts', 'src/useEventLive.test.tsx'],
    ['src/offline-queue.ts', 'src/useEventLive.ts'],
  ],
  [
    'server',
    ['src/game-nights/routes.test.ts', 'src/events/match-preview.test.ts'],
    ['src/game-nights/routes.ts'],
  ],
  ['shared', ['src/game-nights.test.ts'], ['src/game-nights.ts']],
];
const current = {};
for (const [workspace, tests, sources] of tasks) {
  const result = spawnSync(
    process.execPath,
    [
      '.yarn/releases/yarn-3.8.1.cjs',
      'workspace',
      `@podyguard/${workspace}`,
      'test',
      ...tests,
      '--coverage',
      '--reporter=default',
      '--coverage.reporter=text',
      '--coverage.reporter=json-summary',
      `--coverage.reportsDirectory=${resolve('reports/coverage', workspace)}`,
      ...sources.map((s) => `--coverage.include=${s}`),
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  const summary = JSON.parse(
    readFileSync(`reports/coverage/${workspace}/coverage-summary.json`, 'utf8'),
  );
  for (const [path, metrics] of Object.entries(summary)) {
    if (path === 'total') continue;
    current[relative(resolve('.'), path).split(sep).join('/')] =
      Object.fromEntries(
        ['lines', 'branches', 'functions', 'statements'].map((k) => [
          k,
          metrics[k].pct,
        ]),
      );
  }
}
if (
  Object.keys(current).length !==
  tasks.reduce((n, task) => n + task[2].length, 0)
)
  throw new Error('A critical coverage source is missing from the reports.');
const baselinePath = 'docs/testing/coverage-baseline.json';
if (process.argv.includes('--save-baseline')) {
  mkdirSync('docs/testing', { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  for (const [file, metrics] of Object.entries(baseline))
    for (const [metric, minimum] of Object.entries(metrics)) {
      if (
        current[file]?.[metric] === undefined ||
        current[file][metric] < minimum
      )
        throw new Error(`${file}: ${metric} coverage fell below ${minimum}%`);
    }
  console.log('PASS: critical-module coverage did not regress.');
}
