import {
  MODES_BY_FAMILY,
  TREACHERY_POD_SIZES,
  commanderSearchProfile,
  resolveRulesFormat,
  usesCommanderRules,
  type GameMode,
  type GameModeFamily,
  type RulesFormat,
  type CommanderSearchProfile,
} from '@podyguard/shared';
import type { CommanderSelection } from './scryfall';
import { emptySeatCommanders } from './CommanderSeatPickers';
import { readStored, writeStored } from './device-storage';

/**
 * Shared state for the two local match routes. `/match-config` writes it and
 * `/match` reads it, which keeps every knob off the battle screen so it can be
 * checked on a phone exactly as a seated player sees it.
 */
export type MatchConfig = {
  eventName: string;
  joinCode: string;
  gameMode: StandaloneGameMode;
  rulesFormat: RulesFormat;
  seatCount: number;
  poolId: string;
  tableLabel: string;
  deckName: string;
  names: string[];
  commanders: CommanderSelection[][];
  /** Bumped by "Reset game state" to abandon the stored tracker snapshot. */
  resetCount: number;
};

export type StandaloneGameMode = GameMode;

/** Distinct seat colours for “I'm red / I'm player 2” on a shared phone. */
export const SEAT_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#06b6d4',
  '#a855f7',
  '#ec4899',
  '#a3a3a3',
] as const;

export function seatColor(index: number): string {
  return SEAT_COLORS[index % SEAT_COLORS.length]!;
}

export function defaultSeatNames(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `Player ${String(index + 1)}`,
  );
}

export const STANDALONE_GAME_MODES: ReadonlyArray<{
  id: StandaloneGameMode;
  label: string;
  hint: string;
  family: GameModeFamily;
}> = [
  {
    id: 'duel',
    label: 'Duel',
    hint: 'Two players. Each starts on 20 life.',
    family: 'normal',
  },
  {
    id: 'multiplayer',
    label: 'Multiplayer',
    hint: 'Free-for-all without commanders. Everyone starts on 20 life.',
    family: 'normal',
  },
  {
    id: 'commander',
    label: 'Commander',
    hint: 'Free-for-all for 3–6 players. Everyone starts on 40 life.',
    family: 'commander',
  },
  {
    id: 'duel-commander',
    label: 'Duel Commander',
    hint: '1v1 Commander at 20 life. No commander damage; only one partner cast from the zone per game.',
    family: 'commander',
  },
  {
    id: 'brawl',
    label: 'Brawl',
    hint: '1v1 Arena Brawl at 25 life. Planeswalkers and vehicles can lead.',
    family: 'commander',
  },
  {
    id: 'treachery',
    label: 'Treachery',
    hint: 'Secret identities dealt on this device. Pass it around so everyone reads their own in private.',
    family: 'commander',
  },
  {
    id: 'two-headed-giant',
    label: 'Two-Headed Giant',
    hint: 'Two teams of two, 60 shared life each, turns taken together.',
    family: 'commander',
  },
  {
    id: 'archenemy-commander',
    label: 'Archenemy',
    hint: 'One Archenemy on 60 life with a 40-card scheme deck against three heroes sharing 60 life.',
    family: 'commander',
  },
  {
    id: 'emperor',
    label: 'Emperor',
    hint: 'Two teams of three. Protect your Emperor using limited range of influence and deploy creatures.',
    family: 'commander',
  },
  {
    id: 'star',
    label: 'Star',
    hint: 'Five players in a circle. Your neighbors are allies; eliminate both players across from you.',
    family: 'commander',
  },
  {
    id: 'assassin',
    label: 'Assassin',
    hint: 'Secret contracts in a free-for-all. Eliminate your mark, score, and inherit their target.',
    family: 'commander',
  },
];

export function modesForFamily(family: GameModeFamily): ReadonlyArray<{
  id: StandaloneGameMode;
}> {
  return MODES_BY_FAMILY[family].map((id) => ({ id }));
}

export function modeUsesFamily(
  mode: GameMode,
  family: GameModeFamily,
): boolean {
  return MODES_BY_FAMILY[family].includes(mode);
}

/**
 * One picker row for constructed play/host. Duel and multiplayer resolve to
 * their commander twins when the Classic/Commander switch is on; other modes
 * keep the same id and only flip rulesFormat.
 */
export const CONSTRUCTED_BASE_MODES = [
  'duel',
  'multiplayer',
  'brawl',
  'treachery',
  'two-headed-giant',
  'archenemy-commander',
  'emperor',
  'star',
  'assassin',
] as const;

export type ConstructedBaseMode = (typeof CONSTRUCTED_BASE_MODES)[number];

export function baseModeFromGameMode(mode: GameMode): ConstructedBaseMode {
  if (mode === 'duel-commander') {
    return 'duel';
  }
  if (mode === 'commander') {
    return 'multiplayer';
  }
  if ((CONSTRUCTED_BASE_MODES as readonly string[]).includes(mode)) {
    return mode as ConstructedBaseMode;
  }
  return 'multiplayer';
}

/** Brawl has no Classic twin — only offered while Commander rules are on. */
export function baseModeRequiresCommander(base: ConstructedBaseMode): boolean {
  return base === 'brawl';
}

export function resolveConstructedMode(
  base: ConstructedBaseMode,
  commander: boolean,
): { gameMode: GameMode; rulesFormat: RulesFormat } {
  if (base === 'duel') {
    return commander
      ? { gameMode: 'duel-commander', rulesFormat: 'commander' }
      : { gameMode: 'duel', rulesFormat: 'normal' };
  }
  if (base === 'multiplayer') {
    return commander
      ? { gameMode: 'commander', rulesFormat: 'commander' }
      : { gameMode: 'multiplayer', rulesFormat: 'normal' };
  }
  if (base === 'brawl') {
    return { gameMode: 'brawl', rulesFormat: 'commander' };
  }
  return {
    gameMode: base,
    rulesFormat: commander ? 'commander' : 'normal',
  };
}

export function isCommanderEnabled(
  mode: GameMode,
  rulesFormat?: RulesFormat,
): boolean {
  if (mode === 'duel' || mode === 'multiplayer') {
    return false;
  }
  if (
    mode === 'duel-commander' ||
    mode === 'commander' ||
    mode === 'brawl'
  ) {
    return true;
  }
  return (rulesFormat ?? 'commander') === 'commander';
}

export const SEAT_COUNTS = [2, 3, 4, 5, 6];
export const CLASSIC_COMMANDER_SEAT_COUNTS = [3, 4, 5, 6] as const;
const DUEL_SEAT_COUNT = 2;
const MULTIPLAYER_SEAT_COUNTS = [3, 4, 5, 6] as const;
const TEAM_SEAT_COUNT = 4;
const EMPEROR_SEAT_COUNT = 6;
const STAR_SEAT_COUNT = 5;
const ASSASSIN_SEAT_COUNTS = [3, 4, 5, 6, 7, 8] as const;

export function seatCountsForMode(
  gameMode: StandaloneGameMode,
): readonly number[] {
  if (gameMode === 'duel' || gameMode === 'duel-commander' || gameMode === 'brawl') {
    return [DUEL_SEAT_COUNT];
  }
  if (gameMode === 'multiplayer') {
    return MULTIPLAYER_SEAT_COUNTS;
  }
  if (gameMode === 'commander') {
    return CLASSIC_COMMANDER_SEAT_COUNTS;
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

const DEFAULT_NAMES = defaultSeatNames(8);
const CONFIG_KEY = 'podyguard.match.config';

export function defaultMatchConfig(): MatchConfig {
  return {
    eventName: 'Friday Commander',
    joinCode: 'AB23CD',
    gameMode: 'commander',
    rulesFormat: 'commander',
    seatCount: 4,
    poolId: 'b3',
    tableLabel: 'Table 3',
    deckName: 'Atraxa Superfriends',
    names: defaultSeatNames(8),
    commanders: emptySeatCommanders(DEFAULT_NAMES.length),
    resetCount: 0,
  };
}

export function loadMatchConfig(): MatchConfig {
  const defaults = defaultMatchConfig();
  const raw = readStored(CONFIG_KEY);
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
    const rulesFormat = resolveRulesFormat(
      gameMode,
      parsed.rulesFormat ?? defaults.rulesFormat,
    );
    return {
      ...defaults,
      ...parsed,
      gameMode,
      rulesFormat,
      seatCount: seatCountForMode(
        gameMode,
        parsed.seatCount ?? defaults.seatCount,
      ),
      names: parsed.names ?? DEFAULT_NAMES,
      commanders: usesCommanderRules(gameMode, rulesFormat)
        ? stored
        : Array.from({ length: DEFAULT_NAMES.length }, () => []),
    };
  } catch {
    return defaults;
  }
}

export function saveMatchConfig(config: MatchConfig): void {
  writeStored(CONFIG_KEY, JSON.stringify(config));
}

export function commanderSearchProfileForConfig(
  config: Pick<MatchConfig, 'gameMode' | 'rulesFormat'>,
): CommanderSearchProfile {
  if (!usesCommanderRules(config.gameMode, config.rulesFormat)) {
    return 'commander';
  }
  return commanderSearchProfile(config.gameMode);
}

export function matchPlayers(
  config: MatchConfig,
): Array<{
  id: string;
  name: string;
  commanders: CommanderSelection[];
}> {
  const withCommanders = usesCommanderRules(config.gameMode, config.rulesFormat);
  return Array.from({ length: config.seatCount }, (_, index) => ({
    id: `sandbox-${String(index + 1)}`,
    name: config.names[index]?.trim() || `Player ${String(index + 1)}`,
    commanders: withCommanders ? (config.commanders[index] ?? []) : [],
  }));
}

export function trackerStorageKey(config: MatchConfig): string {
  return `podyguard.tracker.sandbox.${config.gameMode}.${config.rulesFormat}.${String(config.seatCount)}.${String(config.resetCount)}`;
}
