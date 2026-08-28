import { describe, expect, it } from 'vitest';

import type { EventMetricRecord } from './metrics.js';
import { aggregateScarcityMetrics } from './scarcity-metrics.js';

describe('scarcity diagnostic metrics', () => {
  it('separates exclusive and multi-pool waits without inferring missing data', () => {
    const record: EventMetricRecord = {
      scenarioId: 'SCARCITY_METRICS',
      seed: 1,
      strategyId: 'test',
      suiteVersion: 'test',
      durationSeconds: 1_000,
      participants: [
        {
          id: 'b4-exclusive',
          arrivedAt: 0,
          finalStatus: 'joined',
          preferredPoolId: 'B4',
          acceptedPoolIds: ['B4'],
        },
        {
          id: 'multi',
          arrivedAt: 0,
          finalStatus: 'joined',
          preferredPoolId: 'B3',
          acceptedPoolIds: ['B3', 'B4'],
        },
        {
          id: 'never',
          arrivedAt: 0,
          finalStatus: 'ready',
          preferredPoolId: 'B4',
          acceptedPoolIds: ['B4'],
        },
        { id: 'old-artifact', arrivedAt: 0, finalStatus: 'left' },
      ],
      queueCycles: [
        {
          participantId: 'b4-exclusive',
          cycle: 1,
          startedAt: 0,
          endedAt: 700,
          reason: 'matched',
        },
        {
          participantId: 'multi',
          cycle: 1,
          startedAt: 100,
          endedAt: 400,
          reason: 'matched',
        },
        {
          participantId: 'never',
          cycle: 1,
          startedAt: 0,
          endedAt: 1_000,
          reason: 'event-closed',
        },
      ],
      games: [
        {
          id: 'g1',
          tableId: 't1',
          poolId: 'B4',
          startedAt: 700,
          endedAt: 1_000,
          seats: [
            {
              participantId: 'b4-exclusive',
              preferredPoolId: 'B4',
              acceptedPoolIds: ['B4'],
              assignedPoolId: 'B4',
              preferredPodSize: 4,
              flexDelta: 0,
              concession: false,
              postGameDecision: 'event-closed',
            },
            {
              participantId: 'multi',
              preferredPoolId: 'B3',
              acceptedPoolIds: ['B3', 'B4'],
              assignedPoolId: 'B4',
              preferredPodSize: 4,
              flexDelta: 1,
              concession: true,
              postGameDecision: 'event-closed',
            },
          ],
        },
      ],
      tablePeriods: [
        {
          tableId: 't1',
          startedAt: 0,
          endedAt: 1_000,
          state: 'occupied',
        },
      ],
      safetyViolations: [],
      scarcityDiagnostics: [
        {
          type: 'SCARCITY_REALLOCATION',
          at: 700,
          participantId: 'multi',
          preferredPoolId: 'B3',
          scarcePoolId: 'B4',
          exclusiveParticipantIds: ['b4-exclusive'],
          oldestExclusiveWaitSeconds: 700,
          preferredPoolAlternativeCount: 3,
          baselineSeatedCount: 3,
          candidateSeatedCount: 3,
          explicitlyAccepted: true,
          physicalTableAvailable: true,
        },
      ],
    };

    const result = aggregateScarcityMetrics([record]);
    expect(result.participantMetadataMissing).toBe(1);
    expect(result.exclusive.participants).toBe(2);
    expect(result.exclusive.matchedWait.p95).toBe(700);
    expect(result.exclusive.neverMatched).toEqual({ count: 1, rate: 0.5 });
    expect(result.multiPool.participants).toBe(1);
    expect(result.multiPool.matchedWait.p95).toBe(300);
    expect(result.b4Compatible.participants).toBe(3);
    expect(result.b4Exclusive.participants).toBe(2);
    expect(result.assignments.preferred.rate).toBe(0.5);
    expect(result.assignments.secondary.rate).toBe(0.5);
    expect(result.assignments.secondaryPerEvent).toBe(1);
    expect(result.diagnostics).toEqual({
      missedScarcePoolUnlocks: 0,
      scarcityRedirects: 1,
      scarcityReallocations: 1,
      zeroSeatLossRedirects: 1,
      oneSeatLossRedirects: 0,
      totalImmediateSeatsSacrificed: 0,
      exclusiveParticipantsNewlySeatedThroughSeatLoss: 0,
      redirectsByScarcePool: { B4: 1 },
      oneSeatLossRedirectsByScarcePool: {},
      oneSeatLossRedirectsByControlPool: {},
      opportunityCount: 1,
      missedRate: 0,
      scarcityDrivenSecondaryAssignments: 1,
      uniqueScarcityReallocatedParticipants: 1,
      immediateSeatingReductions: 0,
    });
  });
});
