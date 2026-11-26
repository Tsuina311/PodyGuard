export type DeckPreference = 'preferred' | 'accepted';

export type MatchDeck = {
  id: string;
  poolId: string;
  preference: DeckPreference;
};

export type ReadyParticipant = {
  id: string;
  readyAt: number;
  decks: MatchDeck[];
  /** Event-local only. Never carried across events. */
  flexCredits?: number;
};

export type AvailableTable = {
  id: string;
  capacity?: number;
};

export type MatchHistory = {
  groups: string[][];
};

export type MatchOptions = {
  preferredSize?: number;
  allowedSizes?: number[];
};

export type MatchSeat = {
  participantId: string;
  poolId: string;
  deckId: string;
  concession: boolean;
  flexDelta: number;
};

export type ProposedMatch = {
  tableId: string;
  poolId: string;
  seats: MatchSeat[];
};

export type MatchResult = {
  matches: ProposedMatch[];
  unmatchedIds: string[];
};

export const OPEN_POOL_ID = 'open';
export const PREFERRED_POD_SIZE = 4;
export const FALLBACK_POD_SIZE = 3;
export const FIVE_POD_SIZE = 5;

export const TREACHERY_MIN_POD_SIZE = 4;
export const TREACHERY_MAX_POD_SIZE = 8;
export const EMPEROR_POD_SIZE = 6;
export const STAR_POD_SIZE = 5;
export const ASSASSIN_MIN_POD_SIZE = 3;
export const ASSASSIN_MAX_POD_SIZE = 8;

export function allowedPodSizes(flags: {
  allowThree?: boolean;
  allowFive?: boolean;
  preferredSize?: number;
  maxSize?: number;
  minSize?: number;
}): number[] {
  const preferred = flags.preferredSize ?? PREFERRED_POD_SIZE;
  const maxSize =
    flags.maxSize ??
    Math.max(preferred, flags.allowFive ? FIVE_POD_SIZE : PREFERRED_POD_SIZE);
  const minSize =
    flags.minSize ??
    (flags.allowThree === false ? Math.min(PREFERRED_POD_SIZE, preferred) : FALLBACK_POD_SIZE);
  const sizes: number[] = [];
  for (let size = minSize; size <= maxSize; size += 1) {
    sizes.push(size);
  }
  return [...new Set(sizes)].sort((left, right) => right - left);
}

/**
 * Commander host controls:
 * - preferred size is always legal;
 * - allowThree / allowFive add 3 and 5;
 * - 4 is included whenever more than one size is legal, or when 4 is preferred
 *   (so "wait for full tables" = preferred 4 with both allows off → [4] only;
 *   "force 5" = preferred 5 with allowThree off → [5];
 *   "force 3" = preferred 3 with allowFive off → [3]).
 */
export function commanderAllowedSizes(
  preferredSize: number,
  allowThreePods: boolean,
  allowFivePods: boolean,
): number[] {
  const preferred = Math.min(
    FIVE_POD_SIZE,
    Math.max(FALLBACK_POD_SIZE, preferredSize),
  );
  const sizes = new Set<number>([preferred]);
  if (allowThreePods) {
    sizes.add(FALLBACK_POD_SIZE);
  }
  if (allowFivePods) {
    sizes.add(FIVE_POD_SIZE);
  }
  if (preferred === PREFERRED_POD_SIZE || sizes.size > 1) {
    sizes.add(PREFERRED_POD_SIZE);
  }
  return [...sizes].sort((left, right) => right - left);
}

export { eventTablePolicy as eventMatchOptions } from '@podyguard/shared';
