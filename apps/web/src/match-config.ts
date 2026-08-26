import { TREACHERY_POD_SIZES } from '@podyguard/shared';
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
  gameMode: StandaloneGameMode;
  seatCount: number;
  poolId: string;
  tableLabel: string;
  deckName: string;
  names: string[];
  commanders: CommanderSelection[][];
  /** Bumped by "Reset game state" to abandon the stored tracker snapshot. */
  resetCount: number;
};

export type StandaloneGameMode =
  | 'commander'
  | 'treachery'
  | 'two-headed-giant'
  | 'archenemy-commander'
  | 'emperor'
  | 'star'
  | 'assassin';

export const STANDALONE_GAME_MODES: ReadonlyArray<{
  id: StandaloneGameMode;
  label: string;
  hint: string;
}> = [
  {
    id: 'commander',
    label: 'Commander',
    hint: 'Free-for-all. Everyone starts on 40 life.',
  },
  {
    id: 'treachery',
    label: 'Treachery',
    hint: 'Secret identities dealt on this device. Pass it around so everyone reads their own in private.',
  },
  {
    id: 'two-headed-giant',
    label: 'Two-Headed Giant',
    hint: 'Two teams of two, 60 shared life each, turns taken together.',
  },
  {
    id: 'archenemy-commander',
    label: 'Archenemy',
    hint: 'One Archenemy on 60 life with a 40-card scheme deck against three heroes sharing 60 life.',
  },
  {
    id: 'emperor',
    label: 'Emperor',
    hint: 'Two teams of three. Protect your Emperor using limited range of influence and deploy creatures.',
  },
  {
    id: 'star',
    label: 'Star',
    hint: 'Five players in a circle. Your neighbors are allies; eliminate both players across from you.',
  },
  {
    id: 'assassin',
    label: 'Assassin',
    hint: 'Secret contracts in a free-for-all. Eliminate your mark, score, and inherit their target.',
  },
];

export const SEAT_COUNTS = [2, 3, 4, 5, 6];
const TEAM_SEAT_COUNT = 4;
const EMPEROR_SEAT_COUNT = 6;
const STAR_SEAT_COUNT = 5;
const ASSASSIN_SEAT_COUNTS = [3, 4, 5, 6, 7, 8] as const;

export function seatCountsForMode(
  gameMode: StandaloneGameMode,
): readonly number[] {
  if (gameMode === 'commander') {
    return SEAT_COUNTS;
  }
  if (gameMode === 'assassin') {
    return ASSASSIN_SEAT_COUNTS;
  }
  if (gameMode === 'treachery') {
    return TREACHERY_POD_SIZES;
  }
  return [
    gameMode === 'emperor'
      ? EMPEROR_SEAT_COUNT
      : gameMode === 'star'
        ? STAR_SEAT_COUNT
        : TEAM_SEAT_COUNT,
  ];
}

export function seatCountForMode(
  gameMode: StandaloneGameMode,
  seatCount: number,
): number {
  const allowed = seatCountsForMode(gameMode);
  return allowed.includes(seatCount) ? seatCount : allowed[0]!;
}

const DEFAULT_NAMES = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay'];
const CONFIG_KEY = 'podyguard.match.config';

export function defaultMatchConfig(): MatchConfig {
  return {
    eventName: 'Friday Commander',
    joinCode: 'AB23CD',
    gameMode: 'commander',
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
    const gameMode = STANDALONE_GAME_MODES.some(
      (mode) => mode.id === parsed.gameMode,
    )
      ? parsed.gameMode!
      : defaults.gameMode;
    return {
      ...defaults,
      ...parsed,
      gameMode,
      seatCount: seatCountForMode(
        gameMode,
        parsed.seatCount ?? defaults.seatCount,
      ),
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
  return `podyguard.tracker.sandbox.${config.gameMode}.${String(config.seatCount)}.${String(config.resetCount)}`;
}
