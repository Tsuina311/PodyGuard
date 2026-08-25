/*
  The seat that starts is drawn at random, and a badge announcing the result is
  the dullest way to say so. The board instead runs a spotlight around the seats
  and lets it coast to a halt on the drawn one, so the pod watches the draw
  happen instead of reading its outcome.
*/

export type RevealHop = {
  playerId: string;
  /** Wait before this hop lights up, measured from the one before it. */
  delayMs: number;
};

/** Full laps of the board before the spotlight starts to slow. */
const MIN_LAPS = 2;
const LAP_SPREAD = 3;

/*
  The opening and closing hop rates, both drawn per game: the same pod running
  two games back to back should not see the same spin twice, so one draw blurs
  round the board and the next saunters.
*/
const FAST_MS = 42;
const FAST_SPREAD = 38;
const SLOW_MS = 240;
const SLOW_SPREAD = 190;

/**
 * Lays out the whole spin up front, from a random seat to the drawn one.
 *
 * The hop count is a whole number of laps plus the walk to the target, so the
 * spotlight always lands on the seat the engine picked however long it runs.
 */
export function planFirstPlayerReveal(
  playerIds: string[],
  targetId: string,
  random: () => number = Math.random,
): RevealHop[] {
  const seats = playerIds.length;
  const target = playerIds.indexOf(targetId);
  if (target < 0) {
    return [];
  }
  // A solo board has nowhere to travel, so it simply lights up.
  if (seats < 2) {
    return [{ playerId: targetId, delayMs: 0 }];
  }
  const from = Math.floor(random() * seats);
  const laps = MIN_LAPS + Math.floor(random() * LAP_SPREAD);
  const hops = laps * seats + ((target - from + seats) % seats);
  const fast = FAST_MS + random() * FAST_SPREAD;
  const slow = SLOW_MS + random() * SLOW_SPREAD;
  const plan: RevealHop[] = [];
  for (let hop = 0; hop <= hops; hop += 1) {
    const progress = hop / hops;
    plan.push({
      playerId: playerIds[(from + hop) % seats] ?? targetId,
      // Cubed so the spin holds its speed for most of the way and spends the
      // slowdown at the end, which is where the table is watching.
      delayMs: hop === 0 ? 0 : Math.round(fast + (slow - fast) * progress ** 3),
    });
  }
  return plan;
}
