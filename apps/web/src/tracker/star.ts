export const STAR_PLAYER_COUNT = 5;

export function randomStarOrder(
  playerIds: string[],
  random: () => number = Math.random,
): string[] {
  if (
    playerIds.length !== STAR_PLAYER_COUNT ||
    new Set(playerIds).size !== STAR_PLAYER_COUNT
  ) {
    return [];
  }
  const shuffled = [...playerIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [
      shuffled[swapWith]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

export function swapStarSeats(
  order: string[],
  firstId: string,
  secondId: string,
): string[] {
  const first = order.indexOf(firstId);
  const second = order.indexOf(secondId);
  if (first < 0 || second < 0 || first === second) {
    return [...order];
  }
  const next = [...order];
  [next[first], next[second]] = [next[second]!, next[first]!];
  return next;
}

export function starAllies(order: string[], playerId: string): string[] {
  const index = order.indexOf(playerId);
  if (order.length !== STAR_PLAYER_COUNT || index < 0) {
    return [];
  }
  return [
    order[(index - 1 + STAR_PLAYER_COUNT) % STAR_PLAYER_COUNT]!,
    order[(index + 1) % STAR_PLAYER_COUNT]!,
  ];
}

export function starEnemies(order: string[], playerId: string): string[] {
  const allies = new Set(starAllies(order, playerId));
  return order.filter((id) => id !== playerId && !allies.has(id));
}
