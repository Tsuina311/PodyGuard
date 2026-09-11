import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('release version', () => {
  it('keeps a valid semver in the repo VERSION file', () => {
    const raw = readFileSync(resolve(repoRoot, 'VERSION'), 'utf8').trim();
    expect(raw).toMatch(/^\d+\.\d+\.\d+$/);
    expect(raw).toBe('1.0.0');
  });
});
