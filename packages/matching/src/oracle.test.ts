import { describe, expect, it } from 'vitest';
import { createMatches } from './create-matches.js';
import { isNoWorseThanOracle, optimalityRatio, planScore } from './lab-score.js';
import { optimalMatches } from './oracle.js';
import type { ReadyParticipant } from './types.js';

function player(
  id: string,
  readyAt: number,
  pools: Array<{ poolId: string; preference?: 'preferred' | 'accepted' }>,
): ReadyParticipant {
  return {
    id,
    readyAt,
    decks: pools.map((row, index) => ({
      id: `${id}-${row.poolId}-${String(index)}`,
      poolId: row.poolId,
      preference: row.preference ?? 'preferred',
    })),
  };
}

function tables(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `t${String(index + 1)}` }));
}

function expectOptimal(people: ReadyParticipant[], tableCount: number) {
  const history = { groups: [] as string[][] };
  const production = createMatches(people, tables(tableCount), history);
  const oracle = optimalMatches(people, tables(tableCount), history);
  const productionScore = planScore(production, history);
  const oracleScore = planScore(oracle, history);
  expect(
    isNoWorseThanOracle(productionScore, oracleScore),
    JSON.stringify({ productionScore, oracleScore }),
  ).toBe(true);
  expect(optimalityRatio(productionScore, oracleScore)).toBeGreaterThanOrEqual(1);
}

describe('small-case optimality oracle', () => {
  it('matches 4 same-pool players exactly', () => {
    const people = Array.from({ length: 4 }, (_, index) =>
      player(`p${String(index)}`, index, [{ poolId: 'b3' }]),
    );
    expectOptimal(people, 1);
  });

  it('matches 8 same-pool players into two fours', () => {
    const people = Array.from({ length: 8 }, (_, index) =>
      player(`p${String(index)}`, index, [{ poolId: 'b3' }]),
    );
    expectOptimal(people, 2);
    const production = createMatches(people, tables(2));
    expect(production.matches.map((row) => row.seats.length)).toEqual([4, 4]);
  });

  it('matches 7 same-pool players as 4+3', () => {
    const people = Array.from({ length: 7 }, (_, index) =>
      player(`p${String(index)}`, index, [{ poolId: 'b3' }]),
    );
    expectOptimal(people, 2);
  });

  it('does not mix inflexible brackets on a 6-player field', () => {
    const people = [
      ...Array.from({ length: 3 }, (_, index) =>
        player(`b2-${String(index)}`, index, [{ poolId: 'b2' }]),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        player(`b3-${String(index)}`, 10 + index, [{ poolId: 'b3' }]),
      ),
    ];
    expectOptimal(people, 2);
    const production = createMatches(people, tables(2));
    expect(new Set(production.matches.map((row) => row.poolId))).toEqual(
      new Set(['b2', 'b3']),
    );
  });

  it('places a flex player at least as well as the oracle', () => {
    const people = [
      ...Array.from({ length: 3 }, (_, index) =>
        player(`b2-${String(index)}`, index, [{ poolId: 'b2' }]),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        player(`b3-${String(index)}`, 10 + index, [{ poolId: 'b3' }]),
      ),
      player('flex', 20, [
        { poolId: 'b3', preference: 'preferred' },
        { poolId: 'b2', preference: 'accepted' },
      ]),
    ];
    expectOptimal(people, 2);
  });
});
