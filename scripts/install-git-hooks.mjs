#!/usr/bin/env node
/**
 * Points this clone at .githooks so VERSION auto-bumps on commit.
 * Safe to run repeatedly; fails soft when git is unavailable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hooksPath = resolve(root, '.githooks');

if (!existsSync(resolve(root, '.git'))) {
  process.exit(0);
}

const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
  cwd: root,
  encoding: 'utf8',
});
const value = (current.stdout || '').trim();
if (value === '.githooks' || value === hooksPath) {
  process.exit(0);
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: root,
  encoding: 'utf8',
});
if (result.status !== 0) {
  console.warn(
    'Could not set core.hooksPath=.githooks — run: git config core.hooksPath .githooks',
  );
  process.exit(0);
}
console.log('Configured git hooks path: .githooks (auto version bump on commit)');
