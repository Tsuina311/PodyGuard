import {
  createMatches,
  type AvailableTable,
  type MatchDeck,
  type MatchHistory,
  type MatchOptions,
  type ReadyParticipant,
} from '@podyguard/matching';

export type StrategyDeck = {
  id: string;
  poolId: string;
  preference: 'preferred' | 'accepted';
};

export type MatchmakingParticipant = {
  id: string;
  readyAt: number;
  decks: readonly StrategyDeck[];
  flexCredits: number;
};

export type MatchmakingTable = {
  id: string;
};

export type MatchmakingSettings = {
  preferredSize: number;
  allowedSizes: readonly number[];
};

export type MatchmakingInput = {
  now: number;
  participants: readonly MatchmakingParticipant[];
  tables: readonly MatchmakingTable[];
  priorGroups: readonly (readonly string[])[];
  settings: MatchmakingSettings;
};

export type MatchmakingSeat = {
  participantId: string;
  poolId: string;
  deckId: string;
  concession: boolean;
  flexDelta: number;
};

export type MatchmakingMatch = {
  tableId: string;
  poolId: string;
  seats: MatchmakingSeat[];
};

export type MatchmakingResult = {
  matches: MatchmakingMatch[];
  unmatchedIds: string[];
};

export interface MatchmakingStrategy {
  readonly id: string;
  match(input: MatchmakingInput): MatchmakingResult;
}

/** Production matcher adapter. The engine remains independent from matcher types. */
export class LegacyV1Strategy implements MatchmakingStrategy {
  readonly id = 'legacy-v1';

  match(input: MatchmakingInput): MatchmakingResult {
    const participants: ReadyParticipant[] = input.participants.map((participant) => ({
      id: participant.id,
      readyAt: participant.readyAt,
      decks: participant.decks.map(toMatchDeck),
      flexCredits: participant.flexCredits,
    }));
    const tables: AvailableTable[] = input.tables.map((table) => ({ id: table.id }));
    const history: MatchHistory = {
      groups: input.priorGroups.map((group) => [...group]),
    };
    const options: MatchOptions = {
      preferredSize: input.settings.preferredSize,
      allowedSizes: [...input.settings.allowedSizes],
    };
    return createMatches(participants, tables, history, options);
  }
}

export const legacyV1Strategy: MatchmakingStrategy = new LegacyV1Strategy();
export const legacyV1 = legacyV1Strategy;

export function createLegacyV1Strategy(): MatchmakingStrategy {
  return new LegacyV1Strategy();
}

function toMatchDeck(deck: StrategyDeck): MatchDeck {
  return {
    id: deck.id,
    poolId: deck.poolId,
    preference: deck.preference,
  };
}
