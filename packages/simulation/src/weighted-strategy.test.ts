import { computeFlexDelta } from '@podyguard/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createFrozenQueueV2GraceStrategy,
  type MatchmakingInput,
  type MatchmakingParticipant,
} from './strategy.js';
import {
  DEFAULT_WAIT_URGENCY_CURVE,
  QueueV2WeightedAssignmentStrategy,
  WEIGHTED_PROFILES,
  createWeightedStrategy,
  exclusiveUnlockComponent,
  preferenceComponent,
  scarcityForAssignment,
  seatingComponent,
  waitUrgency,
  weightedTotal,
} from './weighted-strategy.js';

function participant(
  id: string,
  pools: readonly string[],
  readyAt: number,
): MatchmakingParticipant {
  return {
    id,
    readyAt,
    flexCredits: 0,
    decks: pools.map((poolId, index) => ({
      id: `${id}:${poolId}`,
      poolId,
      preference: index === 0 ? 'preferred' : 'accepted',
    })),
  };
}

function people(
  prefix: string,
  count: number,
  pools: readonly string[],
  readyAt: number,
): MatchmakingParticipant[] {
  return Array.from({ length: count }, (_, index) =>
    participant(`${prefix}${index + 1}`, pools, readyAt),
  );
}

function input(
  participants: MatchmakingParticipant[],
  now = 1_200,
  tableCount = 1,
): MatchmakingInput {
  return {
    now,
    participants,
    tables: Array.from({ length: tableCount }, (_, index) => ({
      id: `t${index + 1}`,
    })),
    priorGroups: [],
    settings: { preferredSize: 4, allowedSizes: [4, 3, 5] },
  };
}

function seated(result: ReturnType<QueueV2WeightedAssignmentStrategy['match']>) {
  return result.matches.reduce((sum, match) => sum + match.seats.length, 0);
}

describe('Experiment 2C normalized score components', () => {
  it('uses a bounded monotonic starvation urgency curve', () => {
    const values = [120, 600, 1_800, 3_600].map((seconds) =>
      waitUrgency(seconds),
    );
    expect(values[3]).toBeGreaterThan(values[2]!);
    expect(values[2]).toBeGreaterThan(values[1]!);
    expect(values[1]).toBeGreaterThan(values[0]!);
    expect(waitUrgency(-1)).toBe(0);
    expect(waitUrgency(100_000)).toBe(1);
    expect(waitUrgency(1_200)).toBe(0.5);
    expect(waitUrgency(1_200)).toBe(waitUrgency(1_200));
    expect(DEFAULT_WAIT_URGENCY_CURVE).toHaveLength(6);
  });

  it('scores less-replaceable and pod-unlocking assignments as scarcer', () => {
    expect(scarcityForAssignment(0, [3, 4, 5])).toBeGreaterThan(
      scarcityForAssignment(5, [3, 4, 5]),
    );
    expect(scarcityForAssignment(2, [3, 4, 5])).toBe(1);
    expect(scarcityForAssignment(3, [3, 4, 5])).toBe(0.25);
  });

  it('normalizes exclusive unlock, seating, and preference components', () => {
    expect(exclusiveUnlockComponent(2, 3)).toBeGreaterThan(
      exclusiveUnlockComponent(1, 3),
    );
    expect(exclusiveUnlockComponent(1, 3)).toBeGreaterThan(0);
    expect(seatingComponent(4, 4)).toBeGreaterThan(
      seatingComponent(3, 4),
    );
    expect(seatingComponent(3, 4)).toBeGreaterThan(
      seatingComponent(2, 4),
    );
    expect(preferenceComponent(4, 4)).toBeGreaterThan(
      preferenceComponent(3, 4),
    );
  });

  it('keeps combined totals normalized and validates weights', () => {
    const profile = WEIGHTED_PROFILES[1]!;
    const total = weightedTotal(
      {
        immediateSeating: 0.75,
        waitingUrgency: 0.9,
        exclusiveUnlock: 2 / 3,
        scarcity: 1,
        preference: 0,
      },
      profile.config,
    );
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(1);
    expect(
      () =>
        new QueueV2WeightedAssignmentStrategy('invalid', {
          seatingWeight: -1,
          waitingWeight: 1,
          exclusiveWeight: 1,
          scarcityWeight: 1,
          preferenceWeight: 1,
        }),
    ).toThrow(/finite and non-negative/);
  });

  it('documents five simple human-designed profiles', () => {
    expect(WEIGHTED_PROFILES.map((profile) => profile.label)).toEqual([
      'THROUGHPUT_HEAVY',
      'BALANCED',
      'FAIRNESS_HEAVY',
      'PREFERENCE_HEAVY',
      'STARVATION_HEAVY',
    ]);
    for (const profile of WEIGHTED_PROFILES) {
      expect(
        Object.values(profile.config).every(
          (value) =>
            Array.isArray(value) ||
            [0.25, 0.5, 0.75, 1, 1.5, 2].includes(value as number),
        ),
      ).toBe(true);
    }
  });
});

describe('Experiment 2C weighted whole-plan strategy', () => {
  it('scores and explains the legal 4-seat versus 3-seat alternative', () => {
    const value = input([
      ...people('b2-', 3, ['B2'], 1_100),
      ...people('b4-', 2, ['B4'], 0),
      participant('x', ['B2', 'B4'], 1_200),
    ]);
    const result = createWeightedStrategy(WEIGHTED_PROFILES[1]!).match(value);
    expect(result.weightedDecision?.candidates).toHaveLength(2);
    expect(
      result.weightedDecision?.candidates.every(
        (candidate) =>
          candidate.weightedTotal >= 0 && candidate.weightedTotal <= 1,
      ),
    ).toBe(true);
    expect(result.weightedDecision?.immediateSeatDelta).toBeGreaterThanOrEqual(
      -1,
    );
  });

  it('never generates an undeclared secondary assignment', () => {
    const value = input([
      ...people('b2-', 3, ['B2'], 1_100),
      ...people('b4-', 2, ['B4'], 0),
      participant('x', ['B2'], 1_200),
    ]);
    const result = createWeightedStrategy(WEIGHTED_PROFILES[4]!).match(value);
    expect(
      result.matches.flatMap((match) => match.seats).every((seat) => {
        const person = value.participants.find(
          (entry) => entry.id === seat.participantId,
        )!;
        return person.decks.some((deck) => deck.poolId === seat.poolId);
      }),
    ).toBe(true);
  });

  it('is deterministic with deterministic tie-breaking', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      ...people('b2-', 2, ['B2'], 0),
      ...people('b4-', 2, ['B4'], 0),
      participant('x', ['B3', 'B2', 'B4'], 1_200),
    ]);
    const strategy = createWeightedStrategy(WEIGHTED_PROFILES[2]!);
    expect(strategy.match(value)).toEqual(strategy.match(value));
  });

  it('preserves invariants and hard-caps immediate loss across random fields', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            preferred: fc.constantFrom('B2', 'B3', 'B4'),
            secondary: fc.option(fc.constantFrom('B2', 'B3', 'B4')),
            readyAt: fc.integer({ min: 0, max: 2_000 }),
            flexCredits: fc.integer({ min: 0, max: 6 }),
          }),
          { maxLength: 35 },
        ),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: WEIGHTED_PROFILES.length - 1 }),
        (shapes, tableCount, profileIndex) => {
          const participants = shapes.map((shape, index) => {
            const pools = [
              shape.preferred,
              ...(shape.secondary && shape.secondary !== shape.preferred
                ? [shape.secondary]
                : []),
            ];
            return {
              ...participant(`p${index}`, pools, shape.readyAt),
              flexCredits: shape.flexCredits,
            };
          });
          const value = input(participants, 2_000, tableCount);
          const before = structuredClone(value);
          const control = createFrozenQueueV2GraceStrategy().match(value);
          const result = createWeightedStrategy(
            WEIGHTED_PROFILES[profileIndex]!,
          ).match(value);
          const seatedIds = new Set<string>();
          const tableIds = new Set<string>();
          for (const match of result.matches) {
            expect(value.settings.allowedSizes).toContain(match.seats.length);
            expect(tableIds.has(match.tableId)).toBe(false);
            tableIds.add(match.tableId);
            for (const seat of match.seats) {
              expect(seatedIds.has(seat.participantId)).toBe(false);
              seatedIds.add(seat.participantId);
              const person = participants.find(
                (entry) => entry.id === seat.participantId,
              )!;
              expect(
                person.decks.some((deck) => deck.poolId === seat.poolId),
              ).toBe(true);
              expect(seat.flexDelta).toBe(
                computeFlexDelta({
                  concession: seat.concession,
                  podSize: match.seats.length,
                  flexCredits: person.flexCredits,
                  preferredSize: 4,
                }),
              );
            }
          }
          expect(seated(result)).toBeGreaterThanOrEqual(seated(control) - 1);
          expect([...seatedIds, ...result.unmatchedIds].sort()).toEqual(
            participants.map((entry) => entry.id).sort(),
          );
          expect(value).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
