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

export function allowedPodSizes(flags: {
  allowThree?: boolean;
  allowFive?: boolean;
}): number[] {
  const sizes = [PREFERRED_POD_SIZE];
  if (flags.allowFive) {
    sizes.push(FIVE_POD_SIZE);
  }
  if (flags.allowThree !== false) {
    sizes.push(FALLBACK_POD_SIZE);
  }
  return [...new Set(sizes)].sort((left, right) => right - left);
}
