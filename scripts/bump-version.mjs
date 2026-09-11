#!/usr/bin/env node
/**
 * Bumps the repo-root VERSION file (semver).
 *
 * Usage:
 *   node scripts/bump-version.mjs        # patch (default)
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor
 *   node scripts/bump-version.mjs major
 *
 * Convention: bump patch on every ordinary commit. Use minor/major only for
 * irreversible global changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = resolve(root, 'VERSION');
const kind = (process.argv[2] ?? 'patch').toLowerCase();

if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error(`Unknown bump kind "${kind}". Use patch, minor, or major.`);
  process.exit(1);
}

const current = readFileSync(versionPath, 'utf8').trim();
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) {
  console.error(`VERSION must be semver X.Y.Z, got "${current}"`);
  process.exit(1);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

if (kind === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (kind === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const next = `${major}.${minor}.${patch}`;
writeFileSync(versionPath, `${next}\n`, 'utf8');
console.log(`${current} → ${next}`);
