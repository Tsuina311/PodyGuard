#!/usr/bin/env node
/**
 * Compatibility entrypoint: installs Husky checks and VERSION bump hooks.
 * Safe to run repeatedly; fails soft when git is unavailable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hooksPath = resolve(root, '.husky/_');

if (!existsSync(resolve(root, '.git'))) {
  process.exit(0);
}

const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
  cwd: root,
  encoding: 'utf8',
});
const value = (current.stdout || '').trim();
if (value === '.husky/_' || value === hooksPath) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [resolve(root, 'node_modules/husky/bin.js')], {
  cwd: root,
  encoding: 'utf8',
});
if (result.status !== 0) {
  console.warn(
    'Could not install Husky — run yarn prepare in the repository root.',
  );
  process.exit(0);
}
console.log('Installed Husky checks and automatic version bump.');
