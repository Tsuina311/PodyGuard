import { describe, expect, it } from 'vitest';

import type { EventMetricRecord, MetricGame } from './metrics.js';
import { aggregateStarvationMetrics } from './starvation-metrics.js';

function game(
  id: string,
  participantId: string,
  poolId: string,
  startedAt: number,
): MetricGame {
  return {
    id,
    tableId: `table-${id}`,
    poolId,
    startedAt,
    endedAt: startedAt + 100,
    seats: [
      {
        participantId,
        preferredPoolId: poolId,
        acceptedPoolIds: [poolId],
        assignedPoolId: poolId,
        preferredPodSize: 4,
        flexDelta: 0,
        concession: false,
        postGameDecision: 'event-closed',
      },
    ],
  };
}

describe('full-population starvation metrics', () => {
  it('includes unmatched queue cycles in threshold survival rates', () => {
    const record: EventMetricRecord = {
      scenarioId: 'STARVATION_METRICS',
      seed: 1,
      strategyId: 'test',
      suiteVersion: 'test',
      durationSeconds: 4_000,
      participants: [
        {
          id: 'b2',
          arrivedAt: 0,
          finalStatus: 'playing',
          preferredPoolId: 'B2',
          acceptedPoolIds: ['B2'],
        },
        {
          id: 'b3',
          arrivedAt: 0,
          finalStatus: 'ready',
          preferredPoolId: 'B3',
          acceptedPoolIds: ['B3'],
        },
        {
          id: 'b4',
          arrivedAt: 0,
          finalStatus: 'playing',
          preferredPoolId: 'B4',
          acceptedPoolIds: ['B4'],
        },
      ],
      queueCycles: [
        {
          participantId: 'b2',
          cycle: 1,
          startedAt: 0,
          endedAt: 100,
          reason: 'matched',
        },
        {
          participantId: 'b3',
          cycle: 1,
          startedAt: 0,
          endedAt: 4_000,
          reason: 'event-closed',
        },
        {
          participantId: 'b4',
          cycle: 1,
          startedAt: 0,
          endedAt: 2_000,
          reason: 'matched',
        },
      ],
      games: [game('g1', 'b2', 'B2', 100), game('g2', 'b4', 'B4', 2_000)],
      tablePeriods: [],
      safetyViolations: [],
    };

    const result = aggregateStarvationMetrics([record]);
    expect(result.all.fullWaitSeconds.overThresholdRate['1800']).toBe(2 / 3);
    expect(result.all.fullWaitSeconds.overThresholdRate['3600']).toBe(1 / 3);
    expect(result.all.eventuallyMatched.rate).toBe(2 / 3);
    expect(result.exclusivePools.B3.neverMatched.rate).toBe(1);
    expect(result.exclusivePools.B4.matchedWaitSeconds.p95).toBe(2_000);
    expect(result.worstExclusivePool).toEqual({
      over30Minutes: { poolId: 'B3', rate: 1 },
      over60Minutes: { poolId: 'B3', rate: 1 },
      neverMatched: { poolId: 'B3', rate: 1 },
    });
  });
});
