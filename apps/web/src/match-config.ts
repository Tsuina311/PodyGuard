import { randomSandboxCommanders } from './sandbox-commanders';
import type { CommanderSelection } from './scryfall';

/**
 * Shared state for the two dev-only match routes. `/match-config` writes it and
 * `/match` reads it, which keeps every knob off the battle screen so it can be
 * checked on a phone exactly as a seated player sees it.
 */
export type MatchConfig = {
  eventName: string;
  joinCode: string;
  seatCount: number;
  poolId: string;
  tableLabel: string;
  deckName: string;
  names: string[];
  commanders: CommanderSelection[][];
  /** Bumped by "Reset game state" to abandon the stored tracker snapshot. */
  resetCount: number;
};

export const SEAT_COUNTS = [2, 3, 4, 5, 6];

const DEFAULT_NAMES = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay'];
const CONFIG_KEY = 'podyguard.match.config';

export function defaultMatchConfig(): MatchConfig {
  return {
    eventName: 'Friday Commander',
    joinCode: 'AB23CD',
    seatCount: 4,
    poolId: 'b3',
    tableLabel: 'Table 3',
    deckName: 'Atraxa Superfriends',
    names: DEFAULT_NAMES,
    commanders: randomSandboxCommanders(DEFAULT_NAMES.length),
    resetCount: 0,
  };
}

export function loadMatchConfig(): MatchConfig {
  const defaults = defaultMatchConfig();
  const raw = sessionStorage.getItem(CONFIG_KEY);
  if (!raw) {
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MatchConfig>;
    const stored = parsed.commanders?.some((seat) => seat.length > 0)
      ? parsed.commanders
      : defaults.commanders;
    return {
      ...defaults,
      ...parsed,
      names: parsed.names ?? DEFAULT_NAMES,
      commanders: stored,
    };
  } catch {
    return defaults;
  }
}

export function saveMatchConfig(config: MatchConfig): void {
  sessionStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function matchPlayers(
  config: MatchConfig,
): Array<{
  id: string;
  name: string;
  commanders: CommanderSelection[];
}> {
  return Array.from({ length: config.seatCount }, (_, index) => ({
    id: `sandbox-${String(index + 1)}`,
    name: config.names[index]?.trim() || `Player ${String(index + 1)}`,
    commanders: config.commanders[index] ?? [],
  }));
}

export function trackerStorageKey(config: MatchConfig): string {
  return `podyguard.tracker.sandbox.${String(config.seatCount)}.${String(config.resetCount)}`;
}
