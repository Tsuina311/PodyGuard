import { describe, expect, it } from 'vitest';
import { seatFacesAway, seatGridClass } from './seat-layout';

describe('duel seat layout', () => {
  it('stacks the two seats and turns the far one toward its player', () => {
    expect(seatGridClass(2)).toBe('grid-cols-1 landscape:grid-rows-2');
    expect(seatGridClass(2)).not.toContain('grid-cols-2');
    expect(seatFacesAway(2, 0)).toBe(true);
    expect(seatFacesAway(2, 1)).toBe(false);
  });
});

describe('multiplayer seat layout', () => {
  it('leaves three, four, five, and six player boards as they are', () => {
    expect(seatGridClass(3)).toBe('grid-cols-1 landscape:grid-cols-3');
    expect(seatFacesAway(3, 0)).toBe(false);
    expect(seatFacesAway(3, 1)).toBe(false);
    expect(seatFacesAway(3, 2)).toBe(false);

    expect(seatGridClass(4)).toBe(
      'grid-cols-1 landscape:grid-cols-2 landscape:grid-rows-2',
    );
    expect([0, 1, 2, 3].map((index) => seatFacesAway(4, index))).toEqual([
      true,
      true,
      false,
      false,
    ]);

    expect(seatGridClass(5)).toBe('grid-cols-2 landscape:grid-cols-3');
    expect([0, 1, 2, 3, 4].map((index) => seatFacesAway(5, index))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(
      [0, 1, 2, 3, 4].map((index) => seatFacesAway(5, index, 'star')),
    ).toEqual([true, true, false, false, true]);

    expect(seatGridClass(6)).toBe(
      'grid-cols-2 landscape:grid-cols-3 landscape:grid-rows-2',
    );
    expect([0, 1, 2, 3, 4, 5].map((index) => seatFacesAway(6, index))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it('still turns only the archenemy, even in a four-seat pod', () => {
    expect(
      seatFacesAway(4, 0, 'default', {
        archenemy: true,
        archenemyId: 'boss',
        playerId: 'boss',
      }),
    ).toBe(true);
    expect(
      seatFacesAway(4, 1, 'default', {
        archenemy: true,
        archenemyId: 'boss',
        playerId: 'hero',
      }),
    ).toBe(false);
  });
});
