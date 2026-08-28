import { computeFlexDelta } from '@podyguard/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { runSimulation } from './engine.js';
import { getScenario } from './scenarios.js';
import {
  createQueueV2BoundedSeatLossStrategy,
  createQueueV2ScarcityExperimentalStrategy,
  type MatchmakingInput,
  type MatchmakingParticipant,
} from './strategy.js';

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
  options: {
    now?: number;
    tableCount?: number;
    allowedSizes?: number[];
  } = {},
): MatchmakingInput {
  return {
    now: options.now ?? 1_200,
    participants,
    tables: Array.from(
      { length: options.tableCount ?? 1 },
      (_, index) => ({ id: `t${index + 1}` }),
    ),
    priorGroups: [],
    settings: {
      preferredSize: 4,
      allowedSizes: options.allowedSizes ?? [4, 3, 5],
    },
  };
}

function seatedCount(result: ReturnType<ReturnType<typeof createQueueV2BoundedSeatLossStrategy>['match']>) {
  return result.matches.reduce((sum, match) => sum + match.seats.length, 0);
}

describe('Experiment 2B bounded seat loss', () => {
  it('keeps four seats when oldest exclusive wait is below threshold', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      ...people('b4-', 2, ['B4'], 900),
      participant('x', ['B3', 'B4'], 1_200),
    ]);
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
    expect(seatedCount(result)).toBe(4);
  });

  it('allows a one-seat sacrifice after the starvation threshold', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      ...people('b4-', 2, ['B4'], 0),
      participant('x', ['B3', 'B4'], 1_200),
    ]);
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result.matches[0]?.poolId).toBe('B4');
    expect(seatedCount(result)).toBe(3);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        type: 'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION',
        controlPoolId: 'B3',
        scarcePoolId: 'B4',
        baselineSeatedCount: 4,
        candidateSeatedCount: 3,
        immediateSeatLoss: 1,
      }),
    ]);
  });

  it('rejects a two-seat loss', () => {
    const value = input(
      [
        ...people('b3-', 3, ['B3'], 1_100),
        participant('b4', ['B4'], 0),
        participant('x', ['B3', 'B4'], 1_200),
      ],
      { allowedSizes: [4, 2] },
    );
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
    expect(seatedCount(result)).toBe(4);
  });

  it('retains an existing equal-coverage Experiment 2A redirect', () => {
    const value = input(
      [
        ...people('b3-', 2, ['B3'], 100),
        ...people('b4-', 2, ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      { now: 700 },
    );
    const control = createQueueV2ScarcityExperimentalStrategy(0).match(value);
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result).toEqual(control);
    expect(result.matches[0]?.poolId).toBe('B4');
    expect(seatedCount(result)).toBe(3);
  });

  it('rejects a scarce pool without exclusive participants', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      participant('m1', ['B2', 'B4'], 0),
      participant('m2', ['B2', 'B4'], 0),
      participant('x', ['B3', 'B4'], 1_200),
    ]);
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
  });

  it('never redirects to an unaccepted pool', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      ...people('b4-', 2, ['B4'], 0),
      participant('x', ['B3'], 1_200),
    ]);
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
    expect(result.matches.flatMap((match) => match.seats)).toHaveLength(4);
  });

  it('rejects a long waiter when the scarce pool cannot form a legal pod', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      participant('b4', ['B4'], 0),
      participant('x', ['B3', 'B4'], 1_200),
    ]);
    const result = createQueueV2BoundedSeatLossStrategy(600).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
  });

  it('selects the pool with the oldest exclusive waiter deterministically', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      ...people('b2-', 2, ['B2'], 100),
      ...people('b4-', 2, ['B4'], 0),
      participant('x', ['B3', 'B2', 'B4'], 1_200),
    ]);
    const strategy = createQueueV2BoundedSeatLossStrategy(600);
    const first = strategy.match(value);
    const second = strategy.match(value);
    expect(first).toEqual(second);
    expect(first.matches[0]?.poolId).toBe('B4');
  });

  it('preserves opportunity grace before a three-pod boundary', () => {
    const value = input([
      ...people('b3-', 3, ['B3'], 1_100),
      ...people('b4-', 2, ['B4'], 900),
      participant('x', ['B3', 'B4'], 1_200),
    ]);
    const result = createQueueV2BoundedSeatLossStrategy(0).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
    expect(seatedCount(result)).toBe(4);
  });

  it('produces an identical record for the same seed and configuration', () => {
    const strategy = createQueueV2BoundedSeatLossStrategy(1_200);
    const first = runSimulation(getScenario('NORMAL_FRIDAY_40'), {
      seed: 629,
      strategy,
      randomizationMode: 'paired-v1',
    });
    const second = runSimulation(getScenario('NORMAL_FRIDAY_40'), {
      seed: 629,
      strategy,
      randomizationMode: 'paired-v1',
    });
    expect(first.record).toEqual(second.record);
  });

  it('preserves invariants and bounds immediate loss across random fields', () => {
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
        fc.constantFrom(600, 1_200, 1_800, 2_700),
        (shapes, tableCount, threshold) => {
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
          const value = input(participants, {
            now: 2_000,
            tableCount,
          });
          const before = structuredClone(value);
          const control =
            createQueueV2ScarcityExperimentalStrategy(0).match(value);
          const result =
            createQueueV2BoundedSeatLossStrategy(threshold).match(value);
          const seated = new Set<string>();
          const tables = new Set<string>();
          for (const match of result.matches) {
            expect(value.settings.allowedSizes).toContain(match.seats.length);
            expect(tables.has(match.tableId)).toBe(false);
            tables.add(match.tableId);
            for (const seat of match.seats) {
              expect(seated.has(seat.participantId)).toBe(false);
              seated.add(seat.participantId);
              const player = participants.find(
                (entry) => entry.id === seat.participantId,
              )!;
              expect(
                player.decks.some((deck) => deck.poolId === seat.poolId),
              ).toBe(true);
              expect(seat.flexDelta).toBe(
                computeFlexDelta({
                  concession: seat.concession,
                  podSize: match.seats.length,
                  flexCredits: player.flexCredits,
                  preferredSize: 4,
                }),
              );
            }
          }
          expect(seated.size).toBeGreaterThanOrEqual(
            seatedCount(control) - 1,
          );
          expect([...seated, ...result.unmatchedIds].sort()).toEqual(
            participants.map((entry) => entry.id).sort(),
          );
          expect(value).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
