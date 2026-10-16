/**
 * Seat geometry for the life board.
 *
 * A two-player wide board is two columns, and on a tall phone each total turns
 * to face the player on that side. Portrait stacks the two seats and leaves
 * both totals upright. Pods of three or more keep their own grid.
 */

/** How a two-player board uses the screen. Larger pods only have wide. */
export type DuelBoardLayout = 'wide' | 'portrait';

export function duelBoardLayouts(count: number): DuelBoardLayout[] {
  return count === 2 ? ['wide', 'portrait'] : ['wide'];
}

/** Both layouts stretch to the cell. The grid, not a square, sets the shape. */
export function duelBoardFrameClass(_layout: DuelBoardLayout): string {
  return '';
}

export function duelSeatClass(_layout: DuelBoardLayout): string {
  return '';
}

/**
 * Wide puts the first seat on the right and the second on the left, which is
 * where they land when the stacked board is turned onto its side.
 */
export function duelSeatPlaceClass(
  layout: DuelBoardLayout,
  index: number,
): string {
  if (layout !== 'wide') {
    return '';
  }
  return index === 0 ? 'col-start-2 row-start-1' : 'col-start-1 row-start-1';
}

/**
 * Inner face of a seat. Wide on a tall phone swaps the seat's width and height,
 * then turns each total toward that side. Portrait leaves the lower seat
 * upright and turns the upper seat around so it faces the player at the top
 * of the phone.
 */
export function duelSeatFaceClass(
  layout: DuelBoardLayout,
  index: number,
  sideways: boolean,
): string {
  if (layout === 'portrait') {
    return index === 0 ? 'absolute inset-0 rotate-180' : 'absolute inset-0';
  }
  if (layout !== 'wide' || !sideways) {
    return 'absolute inset-0';
  }
  return [
    'absolute top-1/2 left-1/2 h-[100cqw] w-[100cqh] -translate-x-1/2 -translate-y-1/2',
    index === 0 ? '-rotate-90' : 'rotate-90',
  ].join(' ');
}

/** The center clock turns with a sideways wide board so it reads the same way. */
export function duelClockFaceClass(sideways: boolean): string {
  return sideways ? 'rotate-90' : '';
}

/**
 * How a full-screen sheet turns so it reads the same way as that seat.
 * Wide on a tall phone swaps the box and turns toward the side. Portrait
 * turns the upper player's sheet around; the lower one stays upright.
 */
export function duelPlayerSheetTurnClass(
  layout: DuelBoardLayout,
  index: number,
  sideways: boolean,
): string {
  if (layout === 'portrait' && index === 0) {
    return 'rotate-180';
  }
  if (layout === 'wide' && sideways) {
    return [
      'absolute top-1/2 left-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2',
      index === 0 ? '-rotate-90' : 'rotate-90',
    ].join(' ');
  }
  return '';
}

export function seatGridClass(
  count: number,
  duelLayout: DuelBoardLayout = 'portrait',
): string {
  if (count === 2) {
    return duelLayout === 'wide'
      ? 'grid-cols-2 grid-rows-1'
      : 'grid-cols-1 grid-rows-2';
  }
  if (count <= 1) {
    return 'grid-cols-1';
  }
  if (count === 3) {
    return 'grid-cols-1 landscape:grid-cols-3';
  }
  if (count === 4) {
    // Explicit 2×2 so every seat gets the same fr track on tall phones.
    return 'grid-cols-1 landscape:grid-cols-2 landscape:grid-rows-2';
  }
  if (count === 6) {
    return 'grid-cols-2 landscape:grid-cols-3 landscape:grid-rows-2';
  }
  return 'grid-cols-2 landscape:grid-cols-3';
}

/**
 * Which seats sit across the table in a wide pod. The board no longer rotates
 * those seats; the flag remains for placement tests.
 */
export function seatFacesAway(
  count: number,
  index: number,
  layout: 'default' | 'star' = 'default',
  options: {
    archenemy?: boolean;
    archenemyId?: string | null;
    playerId?: string;
  } = {},
): boolean {
  if (options.archenemy) {
    return options.playerId === options.archenemyId;
  }
  if (count === 2) {
    return index === 0;
  }
  if (count <= 3) {
    return false;
  }
  if (layout === 'star' && count === 5) {
    return index === 0 || index === 1 || index === 4;
  }
  if (count === 4) {
    return index < 2;
  }
  if (count === 5) {
    return index < 3;
  }
  return index < Math.ceil(count / 2);
}
