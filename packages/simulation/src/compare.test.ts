import { describe, expect, it } from 'vitest';

import type { BenchmarkMetricSummary } from './benchmark.js';
import {
  compareArtifacts,
  formatComparisonReport,
  formatSideBySideBaselines,
  type ComparableArtifact,
} from './compare.js';

describe('baseline comparison history', () => {
  it('prints both committed matcher ids side by side with per-scenario deltas', () => {
    const baseline = artifact('legacy-v1', 0.9, 0.05);
    const candidate = artifact('queue-v2-grace-120s-maxwait-600s', 0.6, 0.35);
    const comparison = compareArtifacts(baseline, candidate);
    const report = formatComparisonReport(comparison, { baseline, candidate });
    const history = formatSideBySideBaselines(baseline, candidate);

    expect(history).toContain('legacy-v1');
    expect(history).toContain('queue-v2-grace-120s-maxwait-600s');
    expect(history).toContain('SMALL_EVENT_8');
    expect(report).toContain('Per-scenario deltas');
    expect(report).toContain('SMALL_EVENT_8');
    expect(report).toContain('pod4Rate:');
  });
});

function artifact(
  strategyId: string,
  three: number,
  four: number,
): ComparableArtifact {
  const global = summary(three, four);
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-28T00:00:00.000Z',
    metadata: {
      suiteVersion: 'commander-nights-v1',
      strategyId,
      engineVersion: '1',
      runsPerScenario: 1000,
      seedStart: 1,
      seedEnd: 1000,
      elapsedMs: 1,
      scenarioIds: ['SMALL_EVENT_8'],
    },
    definitions: {
      suite: 'commander-nights-v1',
      strategy: strategyId,
      engine: '1',
    },
    global,
    scenarios: { SMALL_EVENT_8: global },
  };
}

function summary(three: number, four: number): BenchmarkMetricSummary {
  return {
    nights: 1000,
    participants: 8000,
    runtimeMs: 1,
    waitSeconds: { count: 1, median: 90, p95: 1800, max: 9000 },
    unmatched: { participants: 100, rate: 0.01 },
    assignment: {
      seats: 100,
      preferred: 90,
      preferredRate: 0.9,
      secondary: 10,
      secondaryRate: 0.1,
    },
    immediateRematch: { pairs: 1, rate: 0.1 },
    podDistribution: { '3': three * 100, '4': four * 100, '5': 0 },
    requeue: { count: 1, decisions: 2, rate: 0.5 },
    tables: { occupiedSeconds: 1, availableSeconds: 2, utilisation: 0.5 },
    invariantFailures: 0,
  };
}
