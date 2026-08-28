import { describe, expect, it } from 'vitest';

import { aggregateRecords } from './benchmark.js';
import type { EventMetricRecord, MetricQueueCycle } from './metrics.js';

describe('benchmark aggregation', () => {
  it('calculates suite percentiles from raw waits rather than event medians', () => {
    const first = record('FIRST', [matchedWait(0), matchedWait(100)]);
    const second = record('SECOND', [matchedWait(100), matchedWait(100), matchedWait(100)]);

    const summary = aggregateRecords([first, second]);

    expect(summary.waitSeconds).toMatchObject({
      count: 5,
      median: 100,
      p95: 100,
      max: 100,
    });
    expect(summary.nights).toBe(2);
    expect(summary.participants).toBe(2);
  });
});

function matchedWait(seconds: number): MetricQueueCycle {
  return {
    participantId: `p-${seconds}`,
    cycle: 1,
    startedAt: 0,
    endedAt: seconds,
    reason: 'matched',
  };
}

function record(scenarioId: string, queueCycles: MetricQueueCycle[]): EventMetricRecord {
  return {
    scenarioId,
    seed: 1,
    strategyId: 'test',
    suiteVersion: 'test-suite',
    durationSeconds: 100,
    participants: [{ id: 'p', arrivedAt: 0, finalStatus: 'left' }],
    queueCycles,
    games: [],
    tablePeriods: [{ tableId: 't', startedAt: 0, endedAt: 100, state: 'free' }],
    safetyViolations: [],
  };
}
