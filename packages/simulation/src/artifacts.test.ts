import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_SCHEMA_VERSION,
  committedBaselinePath,
  compactBaseline,
  createArtifact,
  csvEscape,
  listCommittedBaselines,
  normalizeBaselineId,
  readArtifact,
  writeCommittedBaseline,
} from './artifacts.js';
import type { BenchmarkResult } from './benchmark.js';

describe('simulation artifacts', () => {
  it('uses RFC 4180 escaping for commas, quotes, and line endings', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape('a\r\nb')).toBe('"a\r\nb"');
  });

  it('records schema and definition identifiers', () => {
    const artifact = createArtifact(emptyBenchmark(), '2026-01-02T03:04:05.000Z');

    expect(artifact.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
    expect(artifact.generatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(artifact.definitions).toEqual({
      suite: 'suite-v1',
      strategy: 'strategy-v1',
      engine: 'engine-v1',
    });
    expect(artifact.environment.node).toBe(process.version);
  });

  it('rejects unsupported artifact schema versions', () => {
    expect(() => readArtifact(new URL(import.meta.url).pathname)).toThrow();
  });

  it('maps --save-baseline ids onto matcher-<id>.json without duplicating the prefix', () => {
    expect(normalizeBaselineId('queue-v2-alpha')).toBe('queue-v2-alpha');
    expect(normalizeBaselineId('matcher-queue-v2-alpha')).toBe('queue-v2-alpha');
    expect(committedBaselinePath('queue-v2-alpha', '/tmp/baselines')).toBe(
      '/tmp/baselines/matcher-queue-v2-alpha.json',
    );
    expect(() => normalizeBaselineId('queue v2')).toThrow(/slug/);
  });

  it('lists committed matcher-*.json baselines', () => {
    const directory = mkdtempSync(join(tmpdir(), 'podyguard-baselines-'));
    try {
      writeCommittedBaseline(createArtifact(emptyBenchmark()), 'legacy-v1', directory);
      writeCommittedBaseline(createArtifact(emptyBenchmark()), 'queue-v2-grace-120s-maxwait-600s', directory);
      expect(listCommittedBaselines(directory).map((path) => path.split(/[/\\]/).at(-1))).toEqual([
        'matcher-legacy-v1.json',
        'matcher-queue-v2-grace-120s-maxwait-600s.json',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('writes a compact committed baseline from latest.json contents', () => {
    const directory = mkdtempSync(join(tmpdir(), 'podyguard-baseline-'));
    try {
      const artifact = createArtifact(emptyBenchmark(), '2026-08-28T08:41:53.094Z');
      artifact.metadata.gitSha = 'b13a2ef3482338180436510f3c14094ed3ba744b';
      const { path, baseline } = writeCommittedBaseline(artifact, 'queue-v2-alpha', directory);
      expect(path).toBe(join(directory, 'matcher-queue-v2-alpha.json'));
      expect(baseline).toEqual(compactBaseline(artifact, 'queue-v2-alpha'));
      expect(baseline).toMatchObject({
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        generatedAt: '2026-08-28T08:41:53.094Z',
        metadata: {
          strategyId: 'queue-v2-alpha',
          suiteVersion: 'suite-v1',
          seedStart: 1,
          seedEnd: 0,
          gitSha: 'b13a2ef3482338180436510f3c14094ed3ba744b',
        },
        definitions: {
          suite: 'suite-v1',
          strategy: 'queue-v2-alpha',
        },
        global: artifact.global,
        scenarios: artifact.scenarios,
      });
      expect(baseline).not.toHaveProperty('nights');
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(baseline);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function emptyBenchmark(): BenchmarkResult {
  const summary = {
    nights: 0,
    participants: 0,
    runtimeMs: 0,
    waitSeconds: { count: 0, median: 0, p95: 0, max: 0 },
    unmatched: { participants: 0, rate: 0 },
    assignment: { seats: 0, preferred: 0, preferredRate: 0, secondary: 0, secondaryRate: 0 },
    immediateRematch: { pairs: 0, rate: 0 },
    podDistribution: {},
    requeue: { count: 0, decisions: 0, rate: 0 },
    tables: { occupiedSeconds: 0, availableSeconds: 0, utilisation: 0 },
    invariantFailures: 0,
  };
  return {
    suiteVersion: 'suite-v1',
    strategyId: 'strategy-v1',
    engineVersion: 'engine-v1',
    runsPerScenario: 0,
    seedStart: 1,
    elapsedMs: 0,
    records: [],
    nights: [],
    global: summary,
    scenarios: {},
  };
}
