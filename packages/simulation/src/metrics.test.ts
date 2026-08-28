import { describe, expect, it } from 'vitest';
import {
  calculateEventMetrics,
  distributionMetrics,
  median,
  nearestRankPercentile,
  type EventMetricRecord,
  type MetricGame,
  type MetricGameSeat,
} from './metrics.js';

function seat(
  participantId: string,
  overrides: Partial<MetricGameSeat> = {},
): MetricGameSeat {
  return {
    participantId,
    preferredPoolId: 'B3',
    acceptedPoolIds: ['B3'],
    assignedPoolId: 'B3',
    preferredPodSize: 4,
    flexDelta: 0,
    concession: false,
    postGameDecision: 'stay',
    ...overrides,
  };
}

function game(
  id: string,
  startedAt: number,
  endedAt: number,
  seats: readonly MetricGameSeat[],
  tableId = 'table-01',
): MetricGame {
  return { id, tableId, poolId: 'B3', startedAt, endedAt, seats };
}

describe('distribution metrics', () => {
  it('calculates odd and even medians without mutating input order', () => {
    const odd = [9, 1, 5];
    const even = [10, 2, 8, 4];
    expect(median(odd)).toBe(5);
    expect(median(even)).toBe(6);
    expect(odd).toEqual([9, 1, 5]);
    expect(even).toEqual([10, 2, 8, 4]);
  });

  it('uses nearest-rank percentiles at boundaries and p95', () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(nearestRankPercentile(values, 0.01)).toBe(1);
    expect(nearestRankPercentile(values, 0.5)).toBe(10);
    expect(nearestRankPercentile(values, 0.95)).toBe(19);
    expect(nearestRankPercentile(values, 1)).toBe(20);
    expect(() => nearestRankPercentile(values, 0)).toThrow(/Percentile/);
  });

  it('aggregates count, mean, median, p95, maximum, and thresholds', () => {
    expect(distributionMetrics([1, 2, 3, 4, 100], [3, 99])).toEqual({
      count: 5,
      mean: 22,
      median: 3,
      p95: 100,
      max: 100,
      maxToMedianRatio: 100 / 3,
      overThreshold: { 3: 2, 99: 1 },
      overThresholdRate: { 3: 0.4, 99: 0.2 },
    });
  });
});

describe('event metric aggregation', () => {
  it('aggregates waits, pods, assignments, flex, opponents, games, tables, and safety', () => {
    const games = [
      game('g1', 10, 30, [
        seat('a', { postGameDecision: 'requeue' }),
        seat('b', { postGameDecision: 'pause' }),
        seat('c', {
          preferredPoolId: 'B2',
          acceptedPoolIds: ['B2', 'B3'],
          assignedPoolId: 'B3',
          concession: true,
          flexDelta: 2,
          postGameDecision: 'leave',
        }),
        seat('d', { flexDelta: -3 }),
      ]),
      game('g2', 40, 60, [
        seat('a'),
        seat('b'),
        seat('e', { preferredPodSize: 4, flexDelta: 3 }),
      ]),
    ];
    const record: EventMetricRecord = {
      scenarioId: 'METRICS_TEST',
      seed: 1,
      strategyId: 'test',
      suiteVersion: 'test',
      durationSeconds: 100,
      participants: ['a', 'b', 'c', 'd', 'e', 'never-played'].map((id) => ({
        id,
        arrivedAt: 0,
        finalStatus: 'joined',
      })),
      queueCycles: [
        { participantId: 'a', cycle: 1, startedAt: 0, endedAt: 10, reason: 'matched' },
        { participantId: 'b', cycle: 1, startedAt: 5, endedAt: 10, reason: 'matched' },
        {
          participantId: 'never-played',
          cycle: 1,
          startedAt: 0,
          endedAt: 100,
          reason: 'event-closed',
          diagnostic: 'WAITING_FOR_PLAYERS',
        },
      ],
      games,
      tablePeriods: [
        { tableId: 'table-01', startedAt: 0, endedAt: 10, state: 'free' },
        { tableId: 'table-01', startedAt: 10, endedAt: 30, state: 'occupied' },
        { tableId: 'table-01', startedAt: 30, endedAt: 40, state: 'disabled' },
        { tableId: 'table-01', startedAt: 40, endedAt: 60, state: 'occupied' },
        { tableId: 'table-01', startedAt: 60, endedAt: 100, state: 'free' },
      ],
      safetyViolations: [{ code: 'EXAMPLE', at: 12, detail: 'fixture' }],
    };

    const metrics = calculateEventMetrics(record, [5]);
    expect(metrics.matchedWaitSeconds).toMatchObject({
      count: 2,
      mean: 7.5,
      median: 7.5,
      p95: 10,
      max: 10,
      overThreshold: { 5: 1 },
    });
    expect(metrics.queueCycles).toEqual({
      total: 3,
      matched: 2,
      paused: 0,
      left: 0,
      eventClosed: 1,
      abandoned: 1,
    });
    expect(metrics.unmatched).toEqual({ participants: 1, rate: 1 / 6, openCyclesAtClose: 1 });
    expect(metrics.assignment).toMatchObject({
      seats: 7,
      preferredPool: 6,
      secondaryPool: 1,
      nonPreferredSize: 3,
      flexConcessions: 4,
    });
    expect(metrics.flex).toEqual({ earned: 5, spent: 3, net: 2 });
    expect(metrics.pods.counts).toEqual({ 3: 1, 4: 1 });
    expect(metrics.tables).toEqual({
      occupiedSeconds: 40,
      availableSeconds: 90,
      disabledSeconds: 10,
      utilisation: 40 / 90,
      maxSimultaneousUsed: 1,
    });
    expect(metrics.games).toMatchObject({
      completed: 2,
      gamesPerAttendee: 7 / 6,
      participantGameDecisions: 7,
      requeues: 1,
      requeueRate: 1 / 7,
    });
    expect(metrics.opponents).toMatchObject({
      pairEncounters: 9,
      repeatPairEncounters: 1,
      immediateRematchPairs: 1,
    });
    expect(metrics.waitsByDiagnostic.WAITING_FOR_PLAYERS).toBe(1);
    expect(metrics.safety).toEqual({
      passed: false,
      violationCount: 1,
      byCode: { EXAMPLE: 1 },
    });
  });
});
