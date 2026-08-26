export function randomEmperorTeams(
  playerIds: string[],
  random: () => number = Math.random,
): [string[], string[]] {
  if (playerIds.length !== 6 || new Set(playerIds).size !== 6) {
    return [[], []];
  }
  const shuffled = [...playerIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapWith]] = [
      shuffled[swapWith]!,
      shuffled[index]!,
    ];
  }
  return [shuffled.slice(0, 3), shuffled.slice(3)];
}

export function randomEmperors(
  teams: [string[], string[]],
  random: () => number = Math.random,
): [string | null, string | null] {
  return teams.map(
    (team) => team[Math.floor(random() * team.length)] ?? null,
  ) as [string | null, string | null];
}

export function seatEmperorTeam(
  team: string[],
  emperorId: string,
): string[] {
  if (team.length !== 3 || !team.includes(emperorId)) {
    return [];
  }
  const generals = team.filter((id) => id !== emperorId);
  return [generals[0]!, emperorId, generals[1]!];
}
