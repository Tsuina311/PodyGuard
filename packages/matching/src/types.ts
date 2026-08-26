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

export function eventMatchOptions(input: {
  gameMode:
    | 'commander'
    | 'treachery'
    | 'two-headed-giant'
    | 'archenemy-commander'
    | 'emperor'
    | 'star'
    | 'assassin';
  allowThreePods: boolean;
  allowFivePods: boolean;
  preferredPodSize?: number;
}): MatchOptions {
  if (
    input.gameMode === 'two-headed-giant' ||
    input.gameMode === 'archenemy-commander'
  ) {
    return {
      preferredSize: PREFERRED_POD_SIZE,
      allowedSizes: [PREFERRED_POD_SIZE],
    };
  }
  if (input.gameMode === 'emperor') {
    return {
      preferredSize: EMPEROR_POD_SIZE,
      allowedSizes: [EMPEROR_POD_SIZE],
    };
  }
  if (input.gameMode === 'star') {
    return {
      preferredSize: STAR_POD_SIZE,
      allowedSizes: [STAR_POD_SIZE],
    };
  }
  if (input.gameMode === 'assassin') {
    const preferredSize = Math.min(
      ASSASSIN_MAX_POD_SIZE,
      Math.max(
        ASSASSIN_MIN_POD_SIZE,
        input.preferredPodSize ?? 5,
      ),
    );
    return {
      preferredSize,
      allowedSizes: allowedPodSizes({
        preferredSize,
        minSize: ASSASSIN_MIN_POD_SIZE,
        maxSize: preferredSize,
      }),
    };
  }
  if (input.gameMode === 'treachery') {
    const preferredSize = Math.min(
      TREACHERY_MAX_POD_SIZE,
      Math.max(TREACHERY_MIN_POD_SIZE, input.preferredPodSize ?? TREACHERY_MIN_POD_SIZE),
    );
    return {
      preferredSize,
      allowedSizes: allowedPodSizes({
        allowThree: false,
        preferredSize,
        minSize: TREACHERY_MIN_POD_SIZE,
        maxSize: preferredSize,
      }),
    };
  }
  return {
    preferredSize: PREFERRED_POD_SIZE,
    allowedSizes: allowedPodSizes({
      allowThree: input.allowThreePods,
      allowFive: input.allowFivePods,
    }),
  };
}
