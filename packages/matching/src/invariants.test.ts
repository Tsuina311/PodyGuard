import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createMatches } from './create-matches.js';
import { checkMatchInvariants } from './invariants.js';
import { mulberry32 } from './rng.js';
import { randomReadyField, runMonteCarlo, runSeededSnapshot } from './simulate.js';
import type { ReadyParticipant } from './types.js';

const POOLS = ['b1', 'b2', 'b3', 'b4'] as const;

describe('matching invariants', () => {
  it('holds for seeded snapshots (seed 19281726)', () => {
    for (const size of [7, 11, 17, 30, 50]) {
      const metrics = runSeededSnapshot(19_281_726, size, Math.max(1, Math.floor(size / 4)));
      expect(metrics.invariantFailures, `size ${String(size)}`).toBe(0);
    }
  });

  it('holds across a Monte Carlo sweep', () => {
    for (const metrics of runMonteCarlo(42, [7, 11, 17, 30])) {
      expect(metrics.invariantFailures).toBe(0);
    }
  });

  it('property: random ready fields never violate seating invariants', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 1, max: 8 }),
        (seed, playerCount, tableCount) => {
          const field = randomReadyField(mulberry32(seed), playerCount, tableCount);
          const result = createMatches(field.participants, field.tables, field.history);
          const issues = checkMatchInvariants(
            field.participants,
            field.tables,
            field.history,
            result,
          );
          expect(issues, JSON.stringify({ seed, playerCount, tableCount, issues })).toEqual([]);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('property: generated decks stay same-pool and fully cover the field', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (seed) => {
        const rng = mulberry32(seed);
        const count = 3 + Math.floor(rng() * 12);
        const participants: ReadyParticipant[] = Array.from({ length: count }, (_, index) => {
          const preferred = POOLS[Math.floor(rng() * POOLS.length)] ?? 'b3';
          const decks: ReadyParticipant['decks'] = [
            { id: `${String(index)}-p`, poolId: preferred, preference: 'preferred' },
          ];
          if (rng() < 0.3) {
            const extra = POOLS.find((pool) => pool !== preferred) ?? 'b2';
            decks.push({
              id: `${String(index)}-s`,
              poolId: extra,
              preference: 'accepted',
            });
          }
          return {
            id: `g${String(index)}`,
            readyAt: Math.floor(rng() * 200),
            flexCredits: Math.floor(rng() * 7),
            decks,
          };
        });
        const tables = Array.from({ length: Math.max(1, Math.floor(count / 3)) }, (_, index) => ({
          id: `t${String(index + 1)}`,
        }));
        const result = createMatches(participants, tables);
        expect(checkMatchInvariants(participants, tables, { groups: [] }, result)).toEqual([]);
      }),
      { numRuns: 40 },
    );
  });
});
