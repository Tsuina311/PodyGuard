export function dealAssassinContracts(
  playerIds: string[],
  random: () => number = Math.random,
): string[] {
  if (playerIds.length < 3 || new Set(playerIds).size !== playerIds.length) {
    return [];
  }
  const order = [...playerIds];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [order[index], order[swapWith]] = [order[swapWith]!, order[index]!];
  }
  return order;
}

export function assassinTargets(order: string[]): Record<string, string> {
  return Object.fromEntries(
    order.map((playerId, index) => [
      playerId,
      order[(index + 1) % order.length]!,
    ]),
  );
}
