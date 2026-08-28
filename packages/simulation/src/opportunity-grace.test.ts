import { computeFlexDelta } from '@podyguard/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { runSimulation } from './engine.js';
import {
  CATASTROPHIC_SMALL_EVENT_SEEDS,
  OLDEST_READY_CONTROL_GRACE_SECONDS,
  OPPORTUNITY_GRACE_SECONDS,
  OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS,
  opportunityGraceCandidateSpecs,
} from './opportunity-grace-sweep.js';
import { constant, defineScenario } from './scenario.js';
import { getScenario } from './scenarios.js';
import {
  createQueueV2ExperimentalStrategy,
  createQueueV2OpportunityGraceStrategy,
  legacyV1Strategy,
  UNLIMITED_EXISTING_WAIT,
  type MatchmakingInput,
  type MatchmakingParticipant,
} from './strategy.js';

function participant(
  id: string,
  poolId = 'B3',
  readyAt = 0,
  flexCredits = 0,
): MatchmakingParticipant {
  return {
    id,
    readyAt,
    flexCredits,
    decks: [{ id: `${id}:${poolId}`, poolId, preference: 'preferred' }],
  };
}

function input(
  participants: MatchmakingParticipant[],
  overrides: Partial<MatchmakingInput> = {},
): MatchmakingInput {
  return {
    now: 5,
    participants,
    tables: [{ id: 't1' }, { id: 't2' }],
    priorGroups: [],
    settings: { preferredSize: 4, allowedSizes: [4, 3] },
    ...overrides,
  };
}

describe('queue-v2-opportunity-grace', () => {
  it('returns the exact legacy strategy instance for grace zero', () => {
    expect(createQueueV2OpportunityGraceStrategy(0)).toBe(legacyV1Strategy);
  });

  it('starts the clock when the third player becomes READY, not when the oldest did', () => {
    const value = input(
      [participant('p1', 'B3', 0), participant('p2', 'B3', 10), participant('p3', 'B3', 200)],
      { now: 200 },
    );
    expect(createQueueV2ExperimentalStrategy(30).match(value).matches).toHaveLength(1);
    expect(createQueueV2OpportunityGraceStrategy(30).match(value)).toEqual({
      matches: [],
      unmatchedIds: ['p1', 'p2', 'p3'],
      nextEvaluationAt: 230,
    });
  });

  it('allows the three-pod at the opportunity-plus-grace boundary', () => {
    const participants = [
      participant('p1', 'B3', 0),
      participant('p2', 'B3', 10),
      participant('p3', 'B3', 200),
    ];
    const result = createQueueV2OpportunityGraceStrategy(30).match(
      input(participants, { now: 230 }),
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.seats).toHaveLength(3);
    expect(result.nextEvaluationAt).toBeUndefined();
  });

  it('does not add grace when the oldest already waited the configured maximum', () => {
    const value = input(
      [participant('p1', 'B3', 0), participant('p2', 'B3', 10), participant('p3', 'B3', 200)],
      { now: 200 },
    );
    const result = createQueueV2OpportunityGraceStrategy(30, 120).match(value);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.seats).toHaveLength(3);
    expect(result.nextEvaluationAt).toBeUndefined();
  });

  it('still withholds when existing wait is under the maximum', () => {
    const value = input(
      [participant('p1', 'B3', 0), participant('p2', 'B3', 10), participant('p3', 'B3', 100)],
      { now: 100 },
    );
    expect(createQueueV2OpportunityGraceStrategy(30, 120).match(value).nextEvaluationAt).toBe(130);
  });

  it('unlimited max wait withholds even after a long existing wait', () => {
    const value = input(
      [participant('p1', 'B3', 0), participant('p2', 'B3', 10), participant('p3', 'B3', 10_000)],
      { now: 10_000 },
    );
    expect(
      createQueueV2OpportunityGraceStrategy(30, UNLIMITED_EXISTING_WAIT).match(value).nextEvaluationAt,
    ).toBe(10_030);
  });

  it('forms a four-pod if the fourth compatible player arrives during the hold', () => {
    const result = createQueueV2OpportunityGraceStrategy(60).match(
      input(
        [
          participant('p1', 'B3', 0),
          participant('p2', 'B3', 10),
          participant('p3', 'B3', 20),
          participant('p4', 'B3', 40),
        ],
        { now: 40 },
      ),
    );
    expect(result.matches.map((match) => match.seats.length)).toEqual([4]);
    expect(result.nextEvaluationAt).toBeUndefined();
  });

  it('does not count an incompatible fourth player toward the opportunity', () => {
    const result = createQueueV2OpportunityGraceStrategy(60).match(
      input(
        [
          participant('p1', 'B3', 0),
          participant('p2', 'B3', 10),
          participant('p3', 'B3', 20),
          participant('other', 'B4', 20),
        ],
        { now: 20 },
      ),
    );
    expect(result.matches).toEqual([]);
    expect(result.nextEvaluationAt).toBe(80);
  });

  it('does nothing when size three is illegal', () => {
    const value = input(['p1', 'p2', 'p3'].map((id) => participant(id)), {
      settings: { preferredSize: 4, allowedSizes: [4] },
    });
    expect(createQueueV2OpportunityGraceStrategy(60).match(value)).toEqual(
      legacyV1Strategy.match(value),
    );
  });

  it('preserves matcher invariants and Flex accounting', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        poolId: fc.constantFrom('B3', 'B4'),
        readyAt: fc.integer({ min: 0, max: 100 }),
        flexCredits: fc.integer({ min: 0, max: 6 }),
      }), { maxLength: 30 }),
      fc.integer({ min: 0, max: 100 }),
      (shapes, now) => {
        const participants = shapes.map((shape, index) =>
          participant(`p${index}`, shape.poolId, Math.min(shape.readyAt, now), shape.flexCredits));
        const value = input(participants, {
          now,
          tables: Array.from({ length: 8 }, (_, index) => ({ id: `t${index}` })),
        });
        const before = structuredClone(value);
        const result = createQueueV2OpportunityGraceStrategy(60, 300).match(value);
        const seated = new Set<string>();
        for (const match of result.matches) {
          expect(value.settings.allowedSizes).toContain(match.seats.length);
          for (const seat of match.seats) {
            expect(seated.has(seat.participantId)).toBe(false);
            seated.add(seat.participantId);
            const player = participants.find((entry) => entry.id === seat.participantId)!;
            expect(seat.flexDelta).toBe(computeFlexDelta({
              concession: seat.concession,
              podSize: match.seats.length,
              flexCredits: player.flexCredits,
              preferredSize: 4,
            }));
          }
        }
        expect(value).toEqual(before);
        expect([...seated, ...result.unmatchedIds].sort()).toEqual(
          participants.map((entry) => entry.id).sort(),
        );
      },
    ), { numRuns: 200 });
  });
});

describe('opportunity grace sweep grid', () => {
  it('keeps the requested matrix plus legacy and oldest-ready controls', () => {
    expect(OPPORTUNITY_GRACE_SECONDS).toEqual([30, 60, 90, 120]);
    expect(OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS).toEqual([120, 300, 600, 'unlimited']);
    expect(OLDEST_READY_CONTROL_GRACE_SECONDS).toEqual([30, 60, 90, 120]);
    expect(CATASTROPHIC_SMALL_EVENT_SEEDS).toEqual([174, 510, 299]);
    const specs = opportunityGraceCandidateSpecs(100, 1);
    expect(specs).toHaveLength(1 + 4 + 16);
    expect(specs[0]).toMatchObject({ clock: 'legacy', label: 'legacy-v1' });
    expect(specs.filter((spec) => spec.clock === 'oldest-ready')).toHaveLength(4);
    expect(specs.filter((spec) => spec.clock === 'opportunity')).toHaveLength(16);
  });

  it('evaluates from the third READY in a staggered engine night', () => {
    const scenario = defineScenario({
      id: 'OPPORTUNITY_GRACE_ENGINE_TEST',
      description: 'Third player arrives after a long oldest wait.',
      playerCount: 3,
      durationSeconds: 80,
      tableCount: 1,
      initiallyDisabledTables: 0,
      preferredPodSize: 4,
      allowedPodSizes: [4, 3],
      arrivalSeconds: constant(0),
      readyDelaySeconds: constant(0),
      poolWeights: [{ value: 'B3', weight: 1 }],
      secondaryPoolProbability: 0,
      startingFlex: constant(0),
      gameDurationSeconds: constant(5),
      requeueProbability: 0,
      requeueDelaySeconds: constant(0),
      pauseProbability: 0,
      pauseDurationSeconds: constant(1),
      leaveProbability: 0,
      leaveWhileWaitingProbability: 0,
      pauseWhileWaitingProbability: 0,
      waitingDecisionDelaySeconds: constant(1),
      tableBreaks: [],
    });
    const result = runSimulation(scenario, {
      seed: 1,
      strategy: createQueueV2OpportunityGraceStrategy(10),
      debug: true,
    });
    expect(result.record.games[0]?.startedAt).toBe(10);
    expect(result.metadata).toMatchObject({
      strategyName: 'queue-v2-opportunity-grace',
      graceSeconds: 10,
      strategyId: 'queue-v2-opportunity-grace-10s-maxwait-unlimited',
    });
    expect(result.metadata.replay).toContain('--strategy queue-v2-opportunity-grace --grace 10');
  });

  it('does not alter the diagnosed catastrophic seed under oldest-ready grace', () => {
    const options = { seed: 174, randomizationMode: 'legacy' as const };
    const legacy = runSimulation(getScenario('SMALL_EVENT_8'), {
      ...options,
      strategy: legacyV1Strategy,
    });
    const oldestReady = runSimulation(getScenario('SMALL_EVENT_8'), {
      ...options,
      strategy: createQueueV2ExperimentalStrategy(120),
    });
    expect(oldestReady.record.games.map((game) => game.seats.length)).toEqual(
      legacy.record.games.map((game) => game.seats.length),
    );
  });
});
