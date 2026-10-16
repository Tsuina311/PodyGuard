import { describe, expect, it } from 'vitest';
import {
  duelBoardFrameClass,
  duelBoardLayouts,
  duelClockFaceClass,
  duelPlayerSheetTurnClass,
  duelSeatClass,
  duelSeatFaceClass,
  duelSeatPlaceClass,
  seatFacesAway,
  seatGridClass,
} from './seat-layout';

describe('duel seat layout', () => {
  it('stacks portrait and splits wide, turning each wide seat toward its player', () => {
    expect(seatGridClass(2, 'portrait')).toBe('grid-cols-1 grid-rows-2');
    expect(seatGridClass(2, 'wide')).toBe('grid-cols-2 grid-rows-1');
    expect(seatFacesAway(2, 0)).toBe(true);
    expect(seatFacesAway(2, 1)).toBe(false);
  });

  it('turns a wide board sideways and leaves portrait upright', () => {
    expect(duelBoardLayouts(2)).toEqual(['wide', 'portrait']);
    expect(duelBoardLayouts(4)).toEqual(['wide']);
    expect(duelBoardFrameClass('wide')).toBe('');
    expect(duelSeatClass('portrait')).toBe('');
    expect(duelSeatPlaceClass('wide', 0)).toBe('col-start-2 row-start-1');
    expect(duelSeatPlaceClass('wide', 1)).toBe('col-start-1 row-start-1');
    expect(duelSeatPlaceClass('portrait', 0)).toBe('');
    expect(duelSeatPlaceClass('portrait', 1)).toBe('');
    // Tall phone: swap the seat box, then turn each total toward that side.
    expect(duelSeatFaceClass('wide', 0, true)).toBe(
      'absolute top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2 -rotate-90',
    );
    expect(duelSeatFaceClass('wide', 1, true)).toBe(
      'absolute top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2 rotate-90',
    );
    expect(duelSeatFaceClass('portrait', 0, true)).toBe(
      'absolute inset-0 rotate-180',
    );
    expect(duelSeatFaceClass('portrait', 1, true)).toBe('absolute inset-0');
    expect(duelSeatFaceClass('portrait', 1, false)).toBe('absolute inset-0');
    // A phone that is already wide does not turn the totals again.
    expect(duelSeatFaceClass('wide', 0, false)).toBe('absolute inset-0');
    expect(duelSeatFaceClass('wide', 1, false)).toBe('absolute inset-0');
    expect(duelClockFaceClass(true)).toBe('rotate-90');
    expect(duelClockFaceClass(false)).toBe('');
    expect(duelPlayerSheetTurnClass('wide', 0, true)).toBe(
      'absolute top-1/2 left-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 -rotate-90',
    );
    expect(duelPlayerSheetTurnClass('wide', 1, true)).toBe(
      'absolute top-1/2 left-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 rotate-90',
    );
    expect(duelPlayerSheetTurnClass('wide', 0, false)).toBe('');
    expect(duelPlayerSheetTurnClass('wide', 1, false)).toBe('');
    expect(duelPlayerSheetTurnClass('portrait', 0, false)).toBe('rotate-180');
    expect(duelPlayerSheetTurnClass('portrait', 0, true)).toBe('rotate-180');
    expect(duelPlayerSheetTurnClass('portrait', 1, false)).toBe('');
    expect(duelPlayerSheetTurnClass('portrait', 1, true)).toBe('');
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
