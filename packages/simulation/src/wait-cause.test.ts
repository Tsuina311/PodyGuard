import { describe, expect, it } from 'vitest';
import { runSimulation } from './engine.js';
import { constant, defineScenario } from './scenario.js';
import { getScenario } from './scenarios.js';
import {
  createFrozenQueueV2GraceStrategy,
  legacyV1Strategy,
} from './strategy.js';
import {
  classifyWaitCause,
  emptyWaitCauseSeconds,
  totalWaitCauseSeconds,
  waitCauseAccountingHolds,
  type WaitCauseParticipant,
  type WaitCausePlayingParticipant,
  type WaitCauseSettings,
} from './wait-cause.js';

function ready(
  id: string,
  pools: readonly string[],
  readyAt = 0,
): WaitCauseParticipant {
  return { id, readyAt, poolIds: pools, preferredPoolId: pools[0]! };
}

function playing(
  id: string,
  pools: readonly string[],
  assignedPoolId: string,
): WaitCausePlayingParticipant {
  return {
    id,
    poolIds: pools,
    preferredPoolId: pools[0]!,
    assignedPoolId,
    gameStartedAt: 0,
    gameEndedAt: 3600,
  };
}

function settings(
  overrides: Partial<WaitCauseSettings> & { ready: WaitCauseParticipant[] },
): WaitCauseSettings {
  return {
    now: 100,
    minPodSize: 3,
    preferredPodSize: 4,
    graceSeconds: 120,
    maxExistingWaitSeconds: 600,
    freeTableCount: 1,
    playing: [],
    ...overrides,
  };
}

describe('wait-cause classification', () => {
  it('A. two compatible READY players for min pod 3 is STRUCTURAL_SCARCITY', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({ ready: [ready('p1', ['B4']), ready('p2', ['B4'])] }),
    );
    expect(classified.cause).toBe('STRUCTURAL_SCARCITY');
    expect(classified.legalReadyPod).toBe(false);
  });

  it('B. legal pod exists but no table is TABLE_CAPACITY', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({
        freeTableCount: 0,
        graceSeconds: 0,
        ready: [ready('p1', ['B2']), ready('p2', ['B2']), ready('p3', ['B2']), ready('p4', ['B2'])],
      }),
    );
    expect(classified.cause).toBe('TABLE_CAPACITY');
  });

  it('C. legal pod and table exist but player is not seated is MATCHER_CHOICE', () => {
    const classified = classifyWaitCause(
      'p5',
      settings({
        graceSeconds: 0,
        ready: [
          ready('p1', ['B2']),
          ready('p2', ['B2']),
          ready('p3', ['B2']),
          ready('p4', ['B2']),
          ready('p5', ['B4']),
          ready('p6', ['B4']),
          ready('p7', ['B4']),
        ],
      }),
    );
    expect(classified.cause).toBe('MATCHER_CHOICE');
    expect(classified.legalReadyPod).toBe(true);
  });

  it('D. missing third is a multi-pool player seated in another pool is CONNECTOR_LOCKOUT_OTHER_POOL', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({
        ready: [ready('p1', ['B4']), ready('p2', ['B4'])],
        playing: [playing('c1', ['B2', 'B4'], 'B2')],
      }),
    );
    expect(classified.cause).toBe('CONNECTOR_LOCKOUT_OTHER_POOL');
    expect(classified.connector?.id).toBe('c1');
    expect(classified.connector?.assignedPoolId).toBe('B2');
    expect(classified.connector?.waitingPoolId).toBe('B4');
  });

  it('E. connector playing in the same target pool is CONNECTOR_LOCKOUT_SAME_POOL', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({
        ready: [ready('p1', ['B4']), ready('p2', ['B4'])],
        playing: [playing('c1', ['B2', 'B4'], 'B4')],
      }),
    );
    expect(classified.cause).toBe('CONNECTOR_LOCKOUT_SAME_POOL');
    expect(classified.connector?.assignedPoolId).toBe('B4');
  });

  it('F. active opportunity grace is OPPORTUNITY_GRACE', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({
        now: 50,
        ready: [ready('p1', ['B3'], 0), ready('p2', ['B3'], 10), ready('p3', ['B3'], 20)],
      }),
    );
    expect(classified.cause).toBe('OPPORTUNITY_GRACE');
  });

  it('prefers MATCHER_CHOICE over grace when a non-grace legal pod exists', () => {
    const classified = classifyWaitCause(
      'flex',
      settings({
        now: 50,
        ready: [
          ready('a', ['B3'], 0),
          ready('b', ['B3'], 10),
          ready('flex', ['B3', 'B2'], 20),
          ready('c', ['B2'], 0),
          ready('d', ['B2'], 0),
          ready('e', ['B2'], 0),
          ready('f', ['B2'], 0),
        ],
      }),
    );
    expect(classified.cause).toBe('MATCHER_CHOICE');
  });

  it('prefers TABLE_CAPACITY over grace when no table is free', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({
        now: 50,
        freeTableCount: 0,
        ready: [ready('p1', ['B3'], 0), ready('p2', ['B3'], 10), ready('p3', ['B3'], 20)],
      }),
    );
    expect(classified.cause).toBe('TABLE_CAPACITY');
  });

  it('does not treat exclusive same-pool players as connectors', () => {
    const classified = classifyWaitCause(
      'p1',
      settings({
        ready: [ready('p1', ['B4']), ready('p2', ['B4'])],
        playing: [playing('ex', ['B4'], 'B4')],
      }),
    );
    expect(classified.cause).toBe('STRUCTURAL_SCARCITY');
  });

  it('G. accounting sum equals queue-cycle duration', () => {
    const seconds = emptyWaitCauseSeconds();
    seconds.structuralScarcity = 100;
    seconds.connectorLockoutOtherPool = 50;
    seconds.opportunityGrace = 20;
    expect(totalWaitCauseSeconds(seconds)).toBe(170);
    expect(waitCauseAccountingHolds(170, seconds)).toBe(true);
    expect(waitCauseAccountingHolds(171, seconds)).toBe(false);
  });
});

describe('wait-cause engine accounting', () => {
  it('attributes frozen-grace 3-pod delay to OPPORTUNITY_GRACE', () => {
    const result = runSimulation(
      defineScenario({
        id: 'GRACE_CAUSE',
        description: 'Three same-pool players with a free table.',
        playerCount: 3,
        durationSeconds: 200,
        tableCount: 1,
        initiallyDisabledTables: 0,
        preferredPodSize: 4,
        allowedPodSizes: [4, 3],
        arrivalSeconds: constant(0),
        readyDelaySeconds: constant(0),
        poolWeights: [{ value: 'B3', weight: 1 }],
        secondaryPoolProbability: 0,
        startingFlex: constant(0),
        gameDurationSeconds: constant(30),
        requeueProbability: 0,
        requeueDelaySeconds: constant(0),
        pauseProbability: 0,
        pauseDurationSeconds: constant(5),
        leaveProbability: 0,
        leaveWhileWaitingProbability: 0,
        pauseWhileWaitingProbability: 0,
        waitingDecisionDelaySeconds: constant(2),
        tableBreaks: [],
      }),
      { seed: 1, strategy: createFrozenQueueV2GraceStrategy() },
    );
    for (const cycle of result.record.queueCycles) {
      expect(cycle.waitCauses).toBeDefined();
      expect(
        waitCauseAccountingHolds(cycle.endedAt - cycle.startedAt, cycle.waitCauses!),
      ).toBe(true);
    }
    const first = result.record.queueCycles[0];
    expect(first?.waitCauses?.opportunityGrace).toBe(120);
    expect(first?.endedAt).toBe(120);
  });

  it('attributes waiting with a legal pod and no free table to TABLE_CAPACITY', () => {
    const result = runSimulation(
      defineScenario({
        id: 'TABLE_CAUSE',
        description: 'Four same-pool players and no tables.',
        playerCount: 4,
        durationSeconds: 40,
        tableCount: 1,
        initiallyDisabledTables: 1,
        preferredPodSize: 4,
        allowedPodSizes: [4, 3],
        arrivalSeconds: constant(0),
        readyDelaySeconds: constant(0),
        poolWeights: [{ value: 'B2', weight: 1 }],
        secondaryPoolProbability: 0,
        startingFlex: constant(0),
        gameDurationSeconds: constant(30),
        requeueProbability: 0,
        requeueDelaySeconds: constant(0),
        pauseProbability: 0,
        pauseDurationSeconds: constant(5),
        leaveProbability: 0,
        leaveWhileWaitingProbability: 0,
        pauseWhileWaitingProbability: 0,
        waitingDecisionDelaySeconds: constant(2),
        tableBreaks: [],
      }),
      { seed: 1, strategy: legacyV1Strategy },
    );
    expect(
      result.record.queueCycles.every(
        (cycle) => (cycle.waitCauses?.tableCapacity ?? 0) === cycle.endedAt - cycle.startedAt,
      ),
    ).toBe(true);
  });

  it('keeps wait-cause seconds equal to every queue-cycle duration', () => {
    const result = runSimulation(
      defineScenario({
        id: 'ACCOUNTING_CAUSE',
        description: 'Mixed pools and a free table.',
        playerCount: 8,
        durationSeconds: 120,
        tableCount: 2,
        initiallyDisabledTables: 0,
        preferredPodSize: 4,
        allowedPodSizes: [4, 3],
        arrivalSeconds: constant(0),
        readyDelaySeconds: constant(0),
        poolWeights: [
          { value: 'B2', weight: 1 },
          { value: 'B4', weight: 1 },
        ],
        secondaryPoolProbability: 0.5,
        startingFlex: constant(0),
        gameDurationSeconds: constant(25),
        requeueProbability: 0.4,
        requeueDelaySeconds: constant(5),
        pauseProbability: 0,
        pauseDurationSeconds: constant(5),
        leaveProbability: 0,
        leaveWhileWaitingProbability: 0,
        pauseWhileWaitingProbability: 0,
        waitingDecisionDelaySeconds: constant(2),
        tableBreaks: [],
      }),
      { seed: 9, strategy: createFrozenQueueV2GraceStrategy() },
    );
    expect(result.record.queueCycles.length).toBeGreaterThan(0);
    for (const cycle of result.record.queueCycles) {
      expect(
        waitCauseAccountingHolds(cycle.endedAt - cycle.startedAt, cycle.waitCauses!),
      ).toBe(true);
    }
  });

  it('records other-pool connector lockout on B4_STARVATION_30 seed 231', () => {
    const result = runSimulation(getScenario('B4_STARVATION_30'), {
      seed: 231,
      strategy: createFrozenQueueV2GraceStrategy(),
      randomizationMode: 'paired-v1',
      debug: true,
    });
    const long = result.record.queueCycles.find(
      (cycle) =>
        cycle.participantId === 'p019' && cycle.endedAt - cycle.startedAt > 6000,
    );
    expect(long?.waitCauses?.connectorLockoutOtherPool).toBeGreaterThan(0);
    expect(
      waitCauseAccountingHolds(long!.endedAt - long!.startedAt, long!.waitCauses!),
    ).toBe(true);
  });
});
