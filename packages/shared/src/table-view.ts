/** Explicit public projection: never include secret roles or session credentials. */
export type TableViewState = {
  format: string;
  startedAt: number | null;
  paused: boolean;
  winnerId: string | null;
  players: Array<{
    id: string;
    name: string;
    life: number;
    poison: number;
    commanders: Array<{ id: string; name: string }>;
    commanderDamage: Record<string, number>;
  }>;
};
export type TableViewSnapshot = {
  state: TableViewState;
  updatedAt: number;
  revision: number;
};
