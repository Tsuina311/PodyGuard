import {
  computeFlexDelta,
  createMatchesWithForcedPools,
  type ReadyParticipant,
} from '@podyguard/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createFrozenQueueV2GraceStrategy,
  createQueueV2GraceDiagnosticControl,
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

function input(
  participants: MatchmakingParticipant[],
  tableCount: number,
  now = 700,
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

function ids(prefix: string, count: number, pools: readonly string[], readyAt: number) {
  return Array.from({ length: count }, (_, index) =>
    participant(`${prefix}${index + 1}`, pools, readyAt),
  );
}

describe('queue-v2 scarcity Experiment 2A', () => {
  it('uses a B3/B4 participant in B4 when that maximizes immediate seating', () => {
    const value = input(
      [
        ...ids('b3-', 6, ['B3'], 100),
        ...ids('b4-', 2, ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      3,
    );
    const result = createQueueV2ScarcityExperimentalStrategy(600).match(value);
    expect(
      result.matches.some(
        (match) =>
          match.poolId === 'B4' &&
          match.seats.some((seat) => seat.participantId === 'x'),
      ),
    ).toBe(true);
    expect(result.matches.flatMap((match) => match.seats)).toHaveLength(9);
  });

  it('redirects equal three-seat coverage toward older exclusive participants', () => {
    const value = input(
      [
        ...ids('b3-', 2, ['B3'], 100),
        ...ids('b4-', 2, ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      1,
    );
    const control = createFrozenQueueV2GraceStrategy().match(value);
    const result = createQueueV2ScarcityExperimentalStrategy(600).match(value);
    expect(control.matches[0]?.poolId).toBe('B3');
    expect(result.matches[0]?.poolId).toBe('B4');
    expect(result.matches[0]?.seats).toHaveLength(3);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        type: 'SCARCITY_REALLOCATION',
        participantId: 'x',
        preferredPoolId: 'B3',
        scarcePoolId: 'B4',
        baselineSeatedCount: 3,
        candidateSeatedCount: 3,
        explicitlyAccepted: true,
      }),
    ]);
  });

  it('does not invent a pod for one B4-exclusive participant', () => {
    const value = input(
      [
        ...ids('b3-', 2, ['B3'], 100),
        participant('b4-1', ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      1,
    );
    expect(
      createQueueV2ScarcityExperimentalStrategy(0).match(value),
    ).toEqual(createFrozenQueueV2GraceStrategy().match(value));
  });

  it('keeps normal allocation when the secondary pool cannot form a legal pod', () => {
    const value = input(
      [
        ...ids('b3-', 3, ['B3'], 100),
        participant('b4-1', ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      1,
    );
    const result = createQueueV2ScarcityExperimentalStrategy(0).match(value);
    expect(result.matches[0]?.poolId).toBe('B3');
    expect(result.diagnostics).toBeUndefined();
  });

  it('rejects a scarce-pool choice that would reduce immediate seating', () => {
    const value = input(
      [
        ...ids('b3-', 3, ['B3'], 100),
        ...ids('b4-', 2, ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      1,
    );
    const control = createFrozenQueueV2GraceStrategy().match(value);
    const result = createQueueV2ScarcityExperimentalStrategy(600).match(value);
    expect(control.matches[0]?.seats).toHaveLength(4);
    expect(result).toEqual(control);
  });

  it('rejects forcing a participant into an undeclared pool', () => {
    const people: ReadyParticipant[] = [
      {
        id: 'x',
        readyAt: 0,
        flexCredits: 0,
        decks: [
          {
            id: 'x:B3',
            poolId: 'B3',
            preference: 'preferred',
          },
        ],
      },
    ];
    expect(() =>
      createMatchesWithForcedPools(
        people,
        [{ id: 't1' }],
        { groups: [] },
        { preferredSize: 4, allowedSizes: [4, 3, 5] },
        new Map([['x', 'B4']]),
      ),
    ).toThrow(/unaccepted pool B4/);
  });

  it('preserves frozen grace behavior when no scarcity opportunity exists', () => {
    const value = input(
      ids('b3-', 3, ['B3'], 690),
      1,
      700,
    );
    expect(
      createQueueV2ScarcityExperimentalStrategy(0).match(value),
    ).toEqual(createFrozenQueueV2GraceStrategy().match(value));
  });

  it('reports missed unlocks without changing diagnostic-control assignments', () => {
    const value = input(
      [
        ...ids('b3-', 2, ['B3'], 100),
        ...ids('b4-', 2, ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      1,
    );
    const frozen = createFrozenQueueV2GraceStrategy().match(value);
    const diagnostic = createQueueV2GraceDiagnosticControl().match(value);
    expect(diagnostic.matches).toEqual(frozen.matches);
    expect(diagnostic.unmatchedIds).toEqual(frozen.unmatchedIds);
    expect(diagnostic.diagnostics).toEqual([
      expect.objectContaining({
        type: 'MISSED_SCARCE_POOL_UNLOCK',
        participantId: 'x',
        scarcePoolId: 'B4',
      }),
    ]);
  });

  it('is deterministic and never mutates matcher input', () => {
    const value = input(
      [
        ...ids('b3-', 2, ['B3'], 100),
        ...ids('b4-', 2, ['B4'], 0),
        participant('x', ['B3', 'B4'], 700),
      ],
      1,
    );
    const before = structuredClone(value);
    const strategy = createQueueV2ScarcityExperimentalStrategy(600);
    expect(strategy.match(value)).toEqual(strategy.match(value));
    expect(value).toEqual(before);
  });

  it('preserves assignment invariants and never reduces immediate seating', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            preferred: fc.constantFrom('B2', 'B3', 'B4'),
            secondary: fc.option(fc.constantFrom('B2', 'B3', 'B4')),
            readyAt: fc.integer({ min: 0, max: 1_000 }),
            flexCredits: fc.integer({ min: 0, max: 6 }),
          }),
          { maxLength: 35 },
        ),
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom(0, 120, 300, 600),
        (shapes, tableCount, threshold) => {
          const people = shapes.map((shape, index) => {
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
          const value = input(people, tableCount, 1_000);
          const before = structuredClone(value);
          const control = createFrozenQueueV2GraceStrategy().match(value);
          const result =
            createQueueV2ScarcityExperimentalStrategy(threshold).match(value);
          const controlCount = control.matches.reduce(
            (sum, match) => sum + match.seats.length,
            0,
          );
          const seated = new Set<string>();
          const tables = new Set<string>();
          for (const match of result.matches) {
            expect(value.settings.allowedSizes).toContain(match.seats.length);
            expect(tables.has(match.tableId)).toBe(false);
            tables.add(match.tableId);
            for (const seat of match.seats) {
              expect(seated.has(seat.participantId)).toBe(false);
              seated.add(seat.participantId);
              const player = people.find(
                (entry) => entry.id === seat.participantId,
              )!;
              expect(player.decks.some((deck) => deck.poolId === seat.poolId)).toBe(
                true,
              );
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
          expect(seated.size).toBeGreaterThanOrEqual(controlCount);
          expect([...seated, ...result.unmatchedIds].sort()).toEqual(
            people.map((entry) => entry.id).sort(),
          );
          expect(value).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });
});
