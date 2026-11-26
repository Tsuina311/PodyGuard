#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextVersion } from './release-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bump = process.argv[2] ?? 'patch';

try {
  const base = execFileSync('git', ['show', 'origin/main:VERSION'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const version = nextVersion(base, bump);
  writeFileSync(new URL('../VERSION', import.meta.url), `${version}\n`, 'utf8');
  console.log(`origin/main ${base} → ${version}`);
} catch (error) {
  console.error(error.stderr ? 'Could not read origin/main:VERSION. Run git fetch origin main first.' : error.message);
  process.exitCode = 1;
}
