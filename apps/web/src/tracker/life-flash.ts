/** Recent life taps under one seat. Other seats do not share or clear it. */
export type SeatLifeFlash = {
  amount: number;
  fading: boolean;
};

/**
 * Adds a life step to that seat's burst. A tap on someone else leaves this
 * seat's number alone, so two players can count at the same time.
 */
export function noteSeatLifeFlash(
  flashes: Record<string, SeatLifeFlash>,
  playerId: string,
  delta: number,
): Record<string, SeatLifeFlash> {
  const previous = flashes[playerId]?.amount ?? 0;
  return {
    ...flashes,
    [playerId]: { amount: previous + delta, fading: false },
  };
}

export function fadeSeatLifeFlash(
  flashes: Record<string, SeatLifeFlash>,
  playerId: string,
): Record<string, SeatLifeFlash> {
  const row = flashes[playerId];
  if (!row || row.fading) {
    return flashes;
  }
  return {
    ...flashes,
    [playerId]: { amount: row.amount, fading: true },
  };
}

export function clearSeatLifeFlash(
  flashes: Record<string, SeatLifeFlash>,
  playerId: string,
): Record<string, SeatLifeFlash> {
  if (!(playerId in flashes)) {
    return flashes;
  }
  const next = { ...flashes };
  delete next[playerId];
  return next;
}
