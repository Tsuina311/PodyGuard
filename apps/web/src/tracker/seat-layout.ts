/**
 * Seat geometry for the life board.
 *
 * A duel is two players on opposite sides of the phone, so the seats stack and
 * the far seat turns around. Pods of three or more keep their own grid and
 * facing; those branches are unchanged.
 */

export function seatGridClass(count: number): string {
  if (count === 2) {
    return 'grid-cols-1 landscape:grid-rows-2';
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
 * Seats on the far side of the phone (top of a landscape board) are rotated
 * so the player across the table can read their life total upright.
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
