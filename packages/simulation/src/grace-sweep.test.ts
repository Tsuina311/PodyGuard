import { describe, expect, it } from 'vitest';

import {
  GRACE_SWEEP_SECONDS,
  aggregateGraceSweepRecords,
  paretoEfficientGracePeriods,
  type GraceSweepMetricSummary,
} from './grace-sweep.js';
import type { EventMetricRecord, MetricGameSeat } from './metrics.js';

describe('grace sweep reporting', () => {
  it('uses the complete requested candidate grid', () => {
    expect(GRACE_SWEEP_SECONDS).toEqual([0, 30, 60, 90, 120, 180, 300]);
  });

  it('aggregates raw records with weighted metric denominators', () => {
    const summary = aggregateGraceSweepRecords([record()], 12.5);

    expect(summary.matchedWaitSeconds).toEqual({
      count: 5,
      median: 601,
      p95: 1_801,
      max: 1_801,
      overMinutes: {
        '5': { count: 4, rate: 0.8 },
        '10': { count: 3, rate: 0.6 },
        '15': { count: 2, rate: 0.4 },
        '30': { count: 1, rate: 0.2 },
      },
    });
    expect(summary.neverMatched).toEqual({ count: 0, rate: 0 });
    expect(summary.pods).toEqual({
      total: 2,
      sizes: {
        '3': { count: 1, rate: 0.5 },
        '4': { count: 1, rate: 0.5 },
        '5': { count: 0, rate: 0 },
      },
    });
    expect(summary.assignment.preferredPool).toEqual({ count: 6, rate: 6 / 7 });
    expect(summary.assignment.secondaryPool).toEqual({ count: 1, rate: 1 / 7 });
    expect(summary.immediateRematch).toEqual({
      pairEncounters: 9,
      pairs: 1,
      rate: 1 / 9,
    });
    expect(summary.requeue).toEqual({ count: 0, rate: 0 });
    expect(summary.gamesPerAttendee).toBe(7 / 5);
    expect(summary.eventComposition).toEqual({
      averageMatchedPlayers: 5,
      nightsWithFourPod: { count: 1, rate: 1 },
      nightsWithOnlyThreePods: { count: 0, rate: 0 },
    });
    expect(summary.tables.utilisation).toBe(0.5);
    expect(summary.invariantFailures).toBe(1);
    expect(summary.runtimeMs).toBe(12.5);
  });

  it('keeps all non-dominated candidates without selecting a winner', () => {
    const candidates = [
      candidate(0, { p95: 100, unmatched: 0.1, rematch: 0.1, four: 0.7, preferred: 0.8 }),
      candidate(30, { p95: 90, unmatched: 0.09, rematch: 0.09, four: 0.8, preferred: 0.9 }),
      candidate(60, { p95: 80, unmatched: 0.12, rematch: 0.08, four: 0.85, preferred: 0.88 }),
    ];

    expect(paretoEfficientGracePeriods(candidates)).toEqual([30, 60]);
  });
});

function record(): EventMetricRecord {
  const participants = Array.from({ length: 5 }, (_, index) => ({
    id: `p${index + 1}`,
    arrivedAt: 0,
    finalStatus: 'left' as const,
  }));
  const waitValues = [300, 301, 601, 901, 1_801];
  return {
    scenarioId: 'TEST',
    seed: 1,
    strategyId: 'queue-v2-experimental-grace-30s',
    suiteVersion: 'test',
    durationSeconds: 100,
    participants,
    queueCycles: waitValues.map((endedAt, index) => ({
      participantId: `p${index + 1}`,
      cycle: 1,
      startedAt: 0,
      endedAt,
      reason: 'matched' as const,
    })),
    games: [
      {
        id: 'g1',
        tableId: 't1',
        poolId: 'B3',
        startedAt: 0,
        endedAt: 20,
        seats: ['p1', 'p2', 'p3'].map((id) => seat(id)),
      },
      {
        id: 'g2',
        tableId: 't1',
        poolId: 'B3',
        startedAt: 20,
        endedAt: 50,
        seats: ['p1', 'p2', 'p4', 'p5'].map((id) => seat(id, id === 'p5')),
      },
    ],
    tablePeriods: [
      { tableId: 't1', startedAt: 0, endedAt: 50, state: 'occupied' },
      { tableId: 't1', startedAt: 50, endedAt: 100, state: 'free' },
    ],
    safetyViolations: [{ code: 'TEST', at: 1, detail: 'fixture' }],
  };
}

function seat(participantId: string, secondary = false): MetricGameSeat {
  return {
    participantId,
    preferredPoolId: secondary ? 'B4' : 'B3',
    acceptedPoolIds: secondary ? ['B4', 'B3'] : ['B3'],
    assignedPoolId: 'B3',
    preferredPodSize: 4,
    flexDelta: 0,
    concession: secondary,
    postGameDecision: 'event-closed',
  };
}

function candidate(
  graceSeconds: number,
  values: { p95: number; unmatched: number; rematch: number; four: number; preferred: number },
): { graceSeconds: number; global: GraceSweepMetricSummary } {
  const summary: GraceSweepMetricSummary = {
    nights: 0,
    participants: 0,
    runtimeMs: 0,
    matchedWaitSeconds: {
      count: 0,
      median: 0,
      p95: values.p95,
      max: 0,
      overMinutes: {
        '5': { count: 0, rate: 0 },
        '10': { count: 0, rate: 0 },
        '15': { count: 0, rate: 0 },
        '30': { count: 0, rate: 0 },
      },
    },
    neverMatched: { count: 0, rate: values.unmatched },
    pods: {
      total: 0,
      sizes: {
        '3': { count: 0, rate: 0 },
        '4': { count: 0, rate: values.four },
        '5': { count: 0, rate: 0 },
      },
    },
    assignment: {
      seats: 0,
      preferredPool: { count: 0, rate: values.preferred },
      secondaryPool: { count: 0, rate: 0 },
    },
    immediateRematch: { pairEncounters: 0, pairs: 0, rate: values.rematch },
    requeue: { count: 0, rate: 0 },
    gamesPerAttendee: 0,
    eventComposition: {
      averageMatchedPlayers: 0,
      nightsWithFourPod: { count: 0, rate: 0 },
      nightsWithOnlyThreePods: { count: 0, rate: 0 },
    },
    tables: { occupiedSeconds: 0, availableSeconds: 0, utilisation: 0 },
    invariantFailures: 0,
  };
  return { graceSeconds, global: summary };
}
