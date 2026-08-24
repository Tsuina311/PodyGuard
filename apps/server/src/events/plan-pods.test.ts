import { describe, expect, it } from 'vitest';
import { planPods } from './plan-pods.js';

describe('planPods', () => {
  it('fills tables of 4 first, then a leftover 3', () => {
    const ready = [1, 2, 3, 4, 5, 6, 7];
    const tables = ['A', 'B'];
    expect(planPods(ready, tables)).toEqual([
      { players: [1, 2, 3, 4], table: 'A' },
      { players: [5, 6, 7], table: 'B' },
    ]);
  });

  it('leaves a remainder under 3 unmatched', () => {
    expect(planPods([1, 2, 3, 4, 5], ['A', 'B'])).toEqual([
      { players: [1, 2, 3, 4], table: 'A' },
    ]);
  });
});
