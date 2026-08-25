import { describe, expect, it } from 'vitest';
import { planFirstPlayerReveal } from './first-player-reveal';

const SEATS = ['a', 'b', 'c', 'd'];

/** Walks the drawn randomness so a spin can be asserted exactly. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('first player reveal', () => {
  it('always lands on the drawn seat', () => {
    for (const target of SEATS) {
      const plan = planFirstPlayerReveal(SEATS, target, Math.random);
      expect(plan.at(-1)?.playerId).toBe(target);
    }
  });

  it('runs whole laps before walking to the target', () => {
    // from = 0, laps = 2, so eight hops of board plus two to reach 'c'.
    const plan = planFirstPlayerReveal(SEATS, 'c', sequence([0, 0, 0, 0]));
    expect(plan).toHaveLength(11);
    expect(plan.map((hop) => hop.playerId)).toEqual([
      'a', 'b', 'c', 'd',
      'a', 'b', 'c', 'd',
      'a', 'b', 'c',
    ]);
  });

  it('opens on the first seat without waiting and then slows down', () => {
    const plan = planFirstPlayerReveal(SEATS, 'c', sequence([0, 0, 0, 0]));
    expect(plan[0]?.delayMs).toBe(0);
    const delays = plan.slice(1).map((hop) => hop.delayMs);
    for (const [index, delay] of delays.entries()) {
      const previous = delays[index - 1];
      if (previous !== undefined) {
        expect(delay).toBeGreaterThanOrEqual(previous);
      }
    }
    // The last hop coasts in far slower than the first one flashed by.
    expect(delays.at(-1)).toBeGreaterThan((delays[0] ?? 0) * 3);
  });

  it('varies the spin between games', () => {
    const quick = planFirstPlayerReveal(SEATS, 'b', sequence([0, 0, 0, 0]));
    const long = planFirstPlayerReveal(SEATS, 'b', sequence([0, 0.99, 1, 1]));
    const total = (plan: { delayMs: number }[]) =>
      plan.reduce((sum, hop) => sum + hop.delayMs, 0);
    expect(long).not.toHaveLength(quick.length);
    expect(total(long)).toBeGreaterThan(total(quick));
  });

  it('just lights up a solo board and ignores an unknown seat', () => {
    expect(planFirstPlayerReveal(['a'], 'a')).toEqual([
      { playerId: 'a', delayMs: 0 },
    ]);
    expect(planFirstPlayerReveal(SEATS, 'nobody')).toEqual([]);
  });
});
