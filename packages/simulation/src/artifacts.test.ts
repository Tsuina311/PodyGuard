import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_SCHEMA_VERSION,
  createArtifact,
  csvEscape,
  readArtifact,
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
