import type { GameMode } from './treachery';

/** Advice-only: estimated remaining time below this marks a table as likely free soon. */
export const LIKELY_FREE_SOON_REMAINING_SECONDS = 20 * 60;

/** Advice-only: elapsed play time above this fraction of typical duration marks likely free soon. */
export const LIKELY_FREE_SOON_ELAPSED_RATIO = 0.85;

export type GameDurationHint = {
  typicalSeconds: number;
  sampleCount: number;
  source: 'event' | 'default';
};

export type TableAvailabilityHint = {
  likelyFreeSoon: boolean;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
};

const DEFAULT_GAME_DURATION_SECONDS: Record<GameMode, number> = {
  commander: 90 * 60,
  'duel-commander': 25 * 60,
  duel: 25 * 60,
  brawl: 25 * 60,
  'two-headed-giant': 45 * 60,
  'archenemy-commander': 45 * 60,
  assassin: 60 * 60,
  multiplayer: 60 * 60,
  treachery: 60 * 60,
  star: 60 * 60,
  emperor: 60 * 60,
};

export function defaultGameDurationSeconds(gameMode: GameMode): number {
  return DEFAULT_GAME_DURATION_SECONDS[gameMode];
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? null;
}

export function typicalGameDurationSeconds(
  completedDurations: number[],
  gameMode: GameMode,
): GameDurationHint {
  const eventMedian = median(completedDurations);
  if (eventMedian !== null && completedDurations.length > 0) {
    return {
      typicalSeconds: Math.round(eventMedian),
      sampleCount: completedDurations.length,
      source: 'event',
    };
  }
  return {
    typicalSeconds: defaultGameDurationSeconds(gameMode),
    sampleCount: 0,
    source: 'default',
  };
}

export function tableAvailabilityHint(input: {
  podStatus?: 'formed' | 'playing';
  playingStartedAt?: string | Date | null;
  typicalSeconds: number;
  now?: Date;
}): TableAvailabilityHint | null {
  if (input.podStatus !== 'playing' || !input.playingStartedAt) {
    return null;
  }
  const startedAt =
    input.playingStartedAt instanceof Date
      ? input.playingStartedAt
      : new Date(input.playingStartedAt);
  const startedMs = startedAt.getTime();
  if (Number.isNaN(startedMs)) {
    return null;
  }
  const now = input.now ?? new Date();
  const elapsedSeconds = Math.max(
    0,
    Math.round((now.getTime() - startedMs) / 1000),
  );
  const estimatedRemainingSeconds = Math.max(
    0,
    input.typicalSeconds - elapsedSeconds,
  );
  const likelyFreeSoon =
    estimatedRemainingSeconds <= LIKELY_FREE_SOON_REMAINING_SECONDS ||
    elapsedSeconds >= input.typicalSeconds * LIKELY_FREE_SOON_ELAPSED_RATIO;
  return {
    likelyFreeSoon,
    elapsedSeconds,
    estimatedRemainingSeconds,
  };
}
