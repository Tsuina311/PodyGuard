export type TableShape = 'square' | 'rectangle' | 'round';
export type TableLayout = { shape: TableShape; seats: number };
export type LimitedTablePlan = { draft: TableLayout[]; play: TableLayout[] };

/** Same legal game sizes used by the organizer preview and the queue matcher. */
export function eventTablePolicy(input: {
  gameMode: import('./treachery').GameMode;
  preferredPodSize?: number;
  allowThreePods: boolean;
  allowFivePods: boolean;
}): { preferredSize: number; allowedSizes: number[] } {
  const mode = input.gameMode;
  if (['duel', 'duel-commander', 'brawl'].includes(mode)) return { preferredSize: 2, allowedSizes: [2] };
  if (['two-headed-giant', 'archenemy-commander'].includes(mode)) return { preferredSize: 4, allowedSizes: [4] };
  if (mode === 'emperor') return { preferredSize: 6, allowedSizes: [6] };
  if (mode === 'star') return { preferredSize: 5, allowedSizes: [5] };
  if (mode === 'commander') {
    const preferredSize = Math.min(5, Math.max(3, input.preferredPodSize ?? 4));
    const sizes = new Set([preferredSize]);
    if (input.allowThreePods) sizes.add(3);
    if (input.allowFivePods) sizes.add(5);
    if (preferredSize === 4 || sizes.size > 1) sizes.add(4);
    return { preferredSize, allowedSizes: [...sizes].sort((a, b) => b - a) };
  }
  const min = mode === 'treachery' ? 4 : 3;
  const max = mode === 'multiplayer' ? 6 : 8;
  const preferredSize = Math.min(max, Math.max(min, input.preferredPodSize ?? (mode === 'assassin' ? 5 : 4)));
  return { preferredSize, allowedSizes: Array.from({ length: preferredSize - min + 1 }, (_, index) => preferredSize - index) };
}
/** One independently bookable game area on a physical table. */
export type TableArea = {
  tableNumber: number;
  shape: TableShape;
  totalSeats: number;
  seats: number;
  part: string;
  parts: number;
  draft?: TableLayout;
};

export function validateTableLayouts(value: unknown): TableLayout[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    throw new Error('Choose between 1 and 40 physical tables.');
  }
  return value.map(table => {
    if (!table || !['square', 'rectangle', 'round'].includes(table.shape) ||
        !Number.isInteger(table.seats) || table.seats < 2 || table.seats > 16) {
      throw new Error('Each table needs a shape and between 2 and 16 seats.');
    }
    return { shape: table.shape, seats: table.seats };
  });
}

export function limitedPlayingSeatBudget(playersPerPod: number, draftTableCount: number): number {
  return playersPerPod * Math.max(1, draftTableCount);
}

export function validateLimitedTablePlan(value: unknown, players: number, hasDraft: boolean): LimitedTablePlan {
  const plan = value as LimitedTablePlan;
  const play = validateTableLayouts(plan?.play);
  const draft = hasDraft ? validateTableLayouts(plan?.draft) : [];
  if (hasDraft && draft.some(table => table.seats < players)) {
    throw new Error('Each drafting table must seat a complete draft pod.');
  }
  const maxSeats = limitedPlayingSeatBudget(players, draft.length);
  if (play.reduce((sum, table) => sum + table.seats, 0) > maxSeats) {
    throw new Error(`Provide at most ${maxSeats} seats across the playing tables.`);
  }
  if (play.reduce((sum, table) => sum + Math.floor(table.seats / 2), 0) < Math.max(1, draft.length) * Math.floor(players / 2)) {
    throw new Error('The playing tables need enough two-player spaces for a complete pod.');
  }
  return { draft, play };
}

export function defaultLimitedTablePlan(players: number, hasDraft = true): LimitedTablePlan {
  return {
    draft: hasDraft ? [{ shape: 'round', seats: players }] : [],
    play: Array.from({ length: Math.floor(players / 2) }, () => ({ shape: 'square', seats: 2 })),
  };
}

/** Maximize simultaneous legal games, then occupied seats, then preferred sizes.
 * A seven-seat Commander table therefore becomes 4 + 3, never an illegal duel.
 */
export function tableGameSizes(seats: number, allowed: readonly number[], preferred: number): number[] {
  const sizes = [...new Set(allowed)].filter(size => Number.isInteger(size) && size >= 2 && size <= seats);
  const plans: number[][] = Array.from({ length: seats + 1 }, () => []);
  const better = (a: number[], b: number[]) => a.length > b.length || a.length === b.length &&
    (a.reduce((x, y) => x + y, 0) > b.reduce((x, y) => x + y, 0) ||
      a.reduce((x, y) => x + y, 0) === b.reduce((x, y) => x + y, 0) &&
      a.filter(x => x === preferred).length > b.filter(x => x === preferred).length);
  for (let capacity = 2; capacity <= seats; capacity++) {
    for (const size of sizes) {
      if (size > capacity) continue;
      const candidate = [...plans[capacity - size]!, size];
      if (better(candidate, plans[capacity]!)) plans[capacity] = candidate;
    }
  }
  return plans[seats]!.sort((a, b) => b - a);
}

/** Assign legal groups to fixed-capacity areas, seating the most players first.
 * Returned sizes include zero for areas that should stay free. */
export function allocateTableGames(players: number, capacities: readonly number[], allowed: readonly number[], preferred: number): number[] {
  type Plan = { cost: number; size: number; previous?: Plan };
  let plans = new Map<number, Plan>([[0, { cost: 0, size: 0 }]]);
  for (const capacity of capacities) {
    const next = new Map<number, Plan>();
    for (const [total, previous] of plans) {
      for (const size of [0, ...allowed]) {
        if (size > capacity || total + size > players) continue;
        const cost = previous.cost + (size ? (size === preferred ? 0 : 1000) + 1 + (capacity - size) / 100 : 0);
        const existing = next.get(total + size);
        if (!existing || cost < existing.cost) next.set(total + size, { cost, size, previous });
      }
    }
    plans = next;
  }
  let cursor = plans.get(Math.max(...plans.keys()));
  const result: number[] = [];
  while (cursor?.previous) { result.push(cursor.size); cursor = cursor.previous; }
  return result.reverse();
}

export function buildTableAreas(play: TableLayout[], allowed: readonly number[], preferred: number, draft: TableLayout[] = []): Array<{ label: string; area: TableArea }> {
  return Array.from({ length: Math.max(play.length, draft.length) }, (_, index) => {
    const table = play[index];
    const sizes = table ? tableGameSizes(table.seats, allowed, preferred) : [0];
    if (!sizes.length) throw new Error(`Table ${index + 1} cannot fit a legal game.`);
    return sizes.map((seats, partIndex) => {
      const part = String.fromCharCode(65 + partIndex);
      return {
        label: `Table ${index + 1}${sizes.length > 1 ? ` · Part ${part}` : ''}`,
        area: { tableNumber: index + 1, shape: table?.shape ?? draft[index]!.shape,
          totalSeats: table?.seats ?? 0, seats, part, parts: sizes.length,
          ...(draft[index] ? { draft: draft[index] } : {}) },
      };
    });
  }).flat();
}

export function limitedTableGroups<T extends { id: string; status: string; area?: TableArea }>(tables: T[], hasDraft: boolean, players: number): T[][] {
  if (!tables.some(table => table.area)) return tables.filter(table => table.status === 'free').map(table => [table]);
  if (hasDraft) {
    const groups = new Map<string, T[]>();
    for (const table of tables) {
      if (!table.area) { groups.set(table.id, [table]); continue; }
      if (!table.area?.draft || table.area.draft.seats < players) continue;
      const groupKey = `physical-${table.area.tableNumber}`;
      const group = groups.get(groupKey) ?? [];
      group.push(table);
      groups.set(groupKey, group);
    }
    return [...groups.values()].filter(group => group.every(table => table.status === 'free'));
  }
  const groups: T[][] = [];
  let group: T[] = [];
  let seats = 0;
  for (const table of tables) {
    if (table.status !== 'free' || table.area?.seats === 0) continue;
    group.push(table);
    seats += table.area?.seats ?? players;
    if (seats >= players) { groups.push(group); group = []; seats = 0; }
  }
  return groups;
}

export function draftTableLabel(table: { label: string; area?: TableArea } | undefined): string | null {
  return table ? table.area ? `Table ${table.area.tableNumber}` : table.label : null;
}
