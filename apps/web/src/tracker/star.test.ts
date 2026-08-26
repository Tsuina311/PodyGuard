import { describe, expect, it } from 'vitest';
import {
  randomStarOrder,
  starAllies,
  starEnemies,
  swapStarSeats,
} from './star';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('Star seating', () => {
  it('randomises all five positions without duplicates', () => {
    const randomised = randomStarOrder(order, () => 0);
    expect(new Set(randomised)).toEqual(new Set(order));
    expect(randomised).toHaveLength(5);
  });

  it('swaps two manually selected seats', () => {
    expect(swapStarSeats(order, 'b', 'e')).toEqual([
      'a',
      'e',
      'c',
      'd',
      'b',
    ]);
  });

  it('finds adjacent allies and the two enemies across the star', () => {
    expect(starAllies(order, 'a')).toEqual(['e', 'b']);
    expect(starEnemies(order, 'a')).toEqual(['c', 'd']);
    expect(starAllies(order, 'c')).toEqual(['b', 'd']);
    expect(starEnemies(order, 'c')).toEqual(['a', 'e']);
  });
});
