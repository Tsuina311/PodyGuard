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
  /** Earliest deterministic instant at which the same queue should be deliberately reconsidered. */
  nextEvaluationAt?: number;
};

export type MatchmakingStrategyName =
  | 'legacy-v1'
  | 'queue-v2-experimental'
  | 'queue-v2-opportunity-grace';

export interface MatchmakingStrategy {
  readonly id: string;
  readonly name?: MatchmakingStrategyName;
  readonly graceSeconds?: number;
  /** Finite cap on oldest wait at first 3-pod opportunity; omit for unlimited. */
  readonly maxExistingWaitSeconds?: number;
  match(input: MatchmakingInput): MatchmakingResult;
}

/** Production matcher adapter. The engine remains independent from matcher types. */
export class LegacyV1Strategy implements MatchmakingStrategy {
  readonly id = 'legacy-v1';
  readonly name = 'legacy-v1';

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

/**
 * Experimental queue policy layered on the frozen production matcher.
 *
 * It only withholds an otherwise selected three-player pod when that pool has
 * exactly three compatible ready players and the oldest has not exhausted the
 * configured grace period.
 */
export class QueueV2ExperimentalStrategy implements MatchmakingStrategy {
  readonly name = 'queue-v2-experimental';
  readonly id: string;

  constructor(
    readonly graceSeconds: number,
    private readonly legacy: MatchmakingStrategy = legacyV1Strategy,
  ) {
    if (!Number.isSafeInteger(graceSeconds) || graceSeconds < 0) {
      throw new Error(
        `Experimental queue grace must be a non-negative safe integer, received ${graceSeconds}.`,
      );
    }
    this.id = `queue-v2-experimental-grace-${graceSeconds}s`;
  }

  match(input: MatchmakingInput): MatchmakingResult {
    const legacyResult = this.legacy.match(input);
    if (
      this.graceSeconds === 0 ||
      input.settings.preferredSize !== 4 ||
      !input.settings.allowedSizes.includes(3)
    ) {
      return legacyResult;
    }

    const compatibleByPool = new Map<string, MatchmakingParticipant[]>();
    for (const participant of input.participants) {
      for (const poolId of new Set(participant.decks.map((deck) => deck.poolId))) {
        const compatible = compatibleByPool.get(poolId) ?? [];
        compatible.push(participant);
        compatibleByPool.set(poolId, compatible);
      }
    }

    const withheldIds = new Set<string>();
    let nextEvaluationAt: number | undefined;
    const matches = legacyResult.matches.filter((match) => {
      if (match.seats.length !== 3) return true;
      const compatible = compatibleByPool.get(match.poolId) ?? [];
      if (compatible.length !== 3) return true;
      const oldestReadyAt = Math.min(...compatible.map((participant) => participant.readyAt));
      const poolNextEvaluationAt = oldestReadyAt + this.graceSeconds;
      if (input.now >= poolNextEvaluationAt) return true;
      match.seats.forEach((seat) => withheldIds.add(seat.participantId));
      nextEvaluationAt =
        nextEvaluationAt === undefined
          ? poolNextEvaluationAt
          : Math.min(nextEvaluationAt, poolNextEvaluationAt);
      return false;
    });

    if (withheldIds.size === 0) return legacyResult;
    const unmatchedIds = [...legacyResult.unmatchedIds];
    for (const participant of input.participants) {
      if (withheldIds.has(participant.id) && !unmatchedIds.includes(participant.id)) {
        unmatchedIds.push(participant.id);
      }
    }
    return { matches, unmatchedIds, nextEvaluationAt };
  }
}

export function createQueueV2ExperimentalStrategy(
  graceSeconds: number,
): MatchmakingStrategy {
  if (graceSeconds <= 0) return legacyV1Strategy;
  return new QueueV2ExperimentalStrategy(graceSeconds);
}

export const UNLIMITED_EXISTING_WAIT = Number.POSITIVE_INFINITY;

/**
 * Experiment 1B: delay a lone legal 3-pod from the moment that trio first
 * became matchable (third READY), not from the oldest participant's READY time.
 *
 * Does not change legacy packing, Flex, or Experiment 1 oldest-ready grace.
 */
export class QueueV2OpportunityGraceStrategy implements MatchmakingStrategy {
  readonly name = 'queue-v2-opportunity-grace';
  readonly id: string;
  readonly maxExistingWaitSeconds: number | undefined;

  constructor(
    readonly graceSeconds: number,
    maxExistingWaitSeconds: number = UNLIMITED_EXISTING_WAIT,
    private readonly legacy: MatchmakingStrategy = legacyV1Strategy,
  ) {
    if (!Number.isSafeInteger(graceSeconds) || graceSeconds < 0) {
      throw new Error(
        `Opportunity grace must be a non-negative safe integer, received ${graceSeconds}.`,
      );
    }
    if (
      maxExistingWaitSeconds !== UNLIMITED_EXISTING_WAIT &&
      (!Number.isSafeInteger(maxExistingWaitSeconds) || maxExistingWaitSeconds < 0)
    ) {
      throw new Error(
        `Max existing wait must be a non-negative safe integer or unlimited, received ${maxExistingWaitSeconds}.`,
      );
    }
    this.maxExistingWaitSeconds =
      maxExistingWaitSeconds === UNLIMITED_EXISTING_WAIT ? undefined : maxExistingWaitSeconds;
    const waitLabel =
      this.maxExistingWaitSeconds === undefined ? 'unlimited' : `${this.maxExistingWaitSeconds}s`;
    this.id = `queue-v2-opportunity-grace-${graceSeconds}s-maxwait-${waitLabel}`;
  }

  match(input: MatchmakingInput): MatchmakingResult {
    const legacyResult = this.legacy.match(input);
    if (
      this.graceSeconds === 0 ||
      input.settings.preferredSize !== 4 ||
      !input.settings.allowedSizes.includes(3)
    ) {
      return legacyResult;
    }

    const compatibleByPool = new Map<string, MatchmakingParticipant[]>();
    for (const participant of input.participants) {
      for (const poolId of new Set(participant.decks.map((deck) => deck.poolId))) {
        const compatible = compatibleByPool.get(poolId) ?? [];
        compatible.push(participant);
        compatibleByPool.set(poolId, compatible);
      }
    }

    const withheldIds = new Set<string>();
    let nextEvaluationAt: number | undefined;
    const matches = legacyResult.matches.filter((match) => {
      if (match.seats.length !== 3) return true;
      const compatible = compatibleByPool.get(match.poolId) ?? [];
      if (compatible.length !== 3) return true;
      const readyAts = compatible.map((participant) => participant.readyAt);
      const oldestReadyAt = Math.min(...readyAts);
      const threePlayerOpportunityAt = Math.max(...readyAts);
      const existingWait = threePlayerOpportunityAt - oldestReadyAt;
      if (
        this.maxExistingWaitSeconds !== undefined &&
        existingWait >= this.maxExistingWaitSeconds
      ) {
        return true;
      }
      const poolNextEvaluationAt = threePlayerOpportunityAt + this.graceSeconds;
      if (input.now >= poolNextEvaluationAt) return true;
      match.seats.forEach((seat) => withheldIds.add(seat.participantId));
      nextEvaluationAt =
        nextEvaluationAt === undefined
          ? poolNextEvaluationAt
          : Math.min(nextEvaluationAt, poolNextEvaluationAt);
      return false;
    });

    if (withheldIds.size === 0) return legacyResult;
    const unmatchedIds = [...legacyResult.unmatchedIds];
    for (const participant of input.participants) {
      if (withheldIds.has(participant.id) && !unmatchedIds.includes(participant.id)) {
        unmatchedIds.push(participant.id);
      }
    }
    return { matches, unmatchedIds, nextEvaluationAt };
  }
}

export function createQueueV2OpportunityGraceStrategy(
  graceSeconds: number,
  maxExistingWaitSeconds: number = UNLIMITED_EXISTING_WAIT,
): MatchmakingStrategy {
  if (graceSeconds <= 0) return legacyV1Strategy;
  return new QueueV2OpportunityGraceStrategy(graceSeconds, maxExistingWaitSeconds);
}

function toMatchDeck(deck: StrategyDeck): MatchDeck {
  return {
    id: deck.id,
    poolId: deck.poolId,
    preference: deck.preference,
  };
}
