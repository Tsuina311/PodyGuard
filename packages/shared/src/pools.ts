export const OPEN_POOL_ID = 'open';

/** Commander night uses these pool ids. The matcher only sees generic pool ids. */
export const COMMANDER_POOLS = [
  { id: 'b1', label: 'Bracket 1', short: 'B1' },
  { id: 'b2', label: 'Bracket 2', short: 'B2' },
  { id: 'b3', label: 'Bracket 3', short: 'B3' },
  { id: 'b4', label: 'Bracket 4', short: 'B4' },
] as const;

export type CommanderPoolId = (typeof COMMANDER_POOLS)[number]['id'];

export function poolShortLabel(poolId: string): string {
  const known = COMMANDER_POOLS.find((row) => row.id === poolId);
  if (known) {
    return known.short;
  }
  if (poolId === OPEN_POOL_ID) {
    return 'Open';
  }
  return poolId.toUpperCase();
}

export function poolLabel(poolId: string): string {
  const known = COMMANDER_POOLS.find((row) => row.id === poolId);
  if (known) {
    return known.label;
  }
  if (poolId === OPEN_POOL_ID) {
    return 'Open';
  }
  return poolShortLabel(poolId);
}
