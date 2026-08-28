import {
  createMatches,
  createMatchesWithForcedPools,
  type AvailableTable,
  type MatchDeck,
  type MatchHistory,
  type MatchOptions,
  type ReadyParticipant,
} from '@podyguard/matching';
import type { WeightedDecisionDiagnostic } from './weighted-strategy.js';

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
  diagnostics?: readonly ScarcityDiagnostic[];
  weightedDecision?: WeightedDecisionDiagnostic;
};

export type ScarcityDiagnosticType =
  | 'MISSED_SCARCE_POOL_UNLOCK'
  | 'SCARCITY_REALLOCATION'
  | 'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION';

export type ScarcityDiagnostic = {
  type: ScarcityDiagnosticType;
  at: number;
  participantId: string;
  preferredPoolId: string;
  scarcePoolId: string;
  exclusiveParticipantIds: readonly string[];
  oldestExclusiveWaitSeconds: number;
  preferredPoolAlternativeCount: number;
  baselineSeatedCount: number;
  candidateSeatedCount: number;
  explicitlyAccepted: true;
  physicalTableAvailable: true;
  controlPoolId?: string;
  immediateSeatLoss?: 0 | 1;
  newlySeatedExclusiveParticipantIds?: readonly string[];
  scarcePoolSubstituteCount?: number;
};

export type MatchmakingStrategyName =
  | 'legacy-v1'
  | 'queue-v2-experimental'
  | 'queue-v2-opportunity-grace'
  | 'queue-v2-scarcity-experimental'
  | 'queue-v2-scarcity-bounded-seat-loss'
  | 'queue-v2-weighted-assignment-experimental';

export interface MatchmakingStrategy {
  readonly id: string;
  readonly name?: MatchmakingStrategyName;
  readonly graceSeconds?: number;
  /** Finite cap on oldest wait at first 3-pod opportunity; omit for unlimited. */
  readonly maxExistingWaitSeconds?: number;
  readonly scarcityWaitThresholdSeconds?: number;
  match(input: MatchmakingInput): MatchmakingResult;
}

/** Production matcher adapter. The engine remains independent from matcher types. */
export class LegacyV1Strategy implements MatchmakingStrategy {
  readonly id = 'legacy-v1';
  readonly name = 'legacy-v1';

  match(input: MatchmakingInput): MatchmakingResult {
    return matchLegacy(input);
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

export const QUEUE_V2_GRACE_SECONDS = 120;
export const QUEUE_V2_MAX_EXISTING_WAIT_SECONDS = 600;

export function createFrozenQueueV2GraceStrategy(
  legacy: MatchmakingStrategy = legacyV1Strategy,
): MatchmakingStrategy {
  return new QueueV2OpportunityGraceStrategy(
    QUEUE_V2_GRACE_SECONDS,
    QUEUE_V2_MAX_EXISTING_WAIT_SECONDS,
    legacy,
  );
}

/**
 * Experiment 2A: evaluate one forced preferred-to-secondary pool redirect at a
 * time, after applying the frozen queue-v2 grace wrapper. A redirect is
 * eligible only when it completes a currently impossible scarce-pool pod for
 * waiting exclusive participants, the preferred pool remains independently
 * pod-capable, and final immediate seating is not reduced.
 */
export class QueueV2ScarcityExperimentalStrategy implements MatchmakingStrategy {
  readonly name = 'queue-v2-scarcity-experimental';
  readonly id: string;
  readonly graceSeconds = QUEUE_V2_GRACE_SECONDS;
  readonly maxExistingWaitSeconds = QUEUE_V2_MAX_EXISTING_WAIT_SECONDS;

  constructor(
    readonly scarcityWaitThresholdSeconds: number,
    private readonly applyReallocation = true,
    private readonly frozenGrace: MatchmakingStrategy =
      createFrozenQueueV2GraceStrategy(),
  ) {
    if (
      !Number.isSafeInteger(scarcityWaitThresholdSeconds) ||
      scarcityWaitThresholdSeconds < 0
    ) {
      throw new Error(
        `Scarcity wait threshold must be a non-negative safe integer, received ${scarcityWaitThresholdSeconds}.`,
      );
    }
    this.id = applyReallocation
      ? `queue-v2-scarcity-experimental-threshold-${scarcityWaitThresholdSeconds}s`
      : 'queue-v2-grace-120s-maxwait-600s-scarcity-diagnostics';
  }

  match(input: MatchmakingInput): MatchmakingResult {
    const control = this.frozenGrace.match(input);
    if (input.tables.length === 0 || control.matches.length === 0) {
      return control;
    }
    const opportunities = scarcityOpportunities(
      input,
      control,
      this.scarcityWaitThresholdSeconds,
    );
    if (opportunities.length === 0) {
      return control;
    }
    if (!this.applyReallocation) {
      return {
        ...control,
        diagnostics: opportunities.map((entry) => entry.missed),
      };
    }

    const selected = [...opportunities].sort(compareScarcityOpportunity)[0];
    if (!selected) return control;
    return {
      ...selected.result,
      diagnostics: [
        ...opportunities
          .filter((entry) => entry !== selected)
          .map((entry) => entry.missed),
        {
          ...selected.missed,
          type: 'SCARCITY_REALLOCATION',
        },
      ],
    };
  }
}

export function createQueueV2ScarcityExperimentalStrategy(
  scarcityWaitThresholdSeconds: number,
): MatchmakingStrategy {
  return new QueueV2ScarcityExperimentalStrategy(
    scarcityWaitThresholdSeconds,
  );
}

export function createQueueV2GraceDiagnosticControl(): MatchmakingStrategy {
  return new QueueV2ScarcityExperimentalStrategy(0, false);
}

/**
 * Experiment 2B: start from the Experiment 2A zero-seat-loss decision, then
 * evaluate independent one-player forced alternatives against that decision.
 * At most one alternate is selected and it may lose exactly one immediate seat.
 */
export class QueueV2BoundedSeatLossStrategy
  implements MatchmakingStrategy
{
  readonly name = 'queue-v2-scarcity-bounded-seat-loss';
  readonly id: string;
  readonly graceSeconds = QUEUE_V2_GRACE_SECONDS;
  readonly maxExistingWaitSeconds = QUEUE_V2_MAX_EXISTING_WAIT_SECONDS;
  readonly maxImmediateSeatLoss = 1;

  constructor(
    readonly scarcityWaitThresholdSeconds: number,
    private readonly zeroLossControl: MatchmakingStrategy =
      createQueueV2ScarcityExperimentalStrategy(0),
    private readonly frozenGrace: MatchmakingStrategy =
      createFrozenQueueV2GraceStrategy(),
  ) {
    if (
      !Number.isSafeInteger(scarcityWaitThresholdSeconds) ||
      scarcityWaitThresholdSeconds < 0
    ) {
      throw new Error(
        `Bounded seat-loss threshold must be a non-negative safe integer, received ${scarcityWaitThresholdSeconds}.`,
      );
    }
    this.id =
      `queue-v2-scarcity-bounded-seat-loss-1-threshold-` +
      `${scarcityWaitThresholdSeconds}s`;
  }

  match(input: MatchmakingInput): MatchmakingResult {
    const control = this.zeroLossControl.match(input);
    if (input.tables.length === 0 || control.matches.length === 0) {
      return control;
    }
    const opportunities = boundedSeatLossOpportunities(
      input,
      control,
      this.scarcityWaitThresholdSeconds,
      this.frozenGrace,
    );
    const selected = [...opportunities].sort(
      compareBoundedSeatLossOpportunity,
    )[0];
    if (!selected) return control;
    return {
      ...selected.result,
      diagnostics: [selected.diagnostic],
    };
  }
}

export function createQueueV2BoundedSeatLossStrategy(
  starvationThresholdSeconds: number,
): MatchmakingStrategy {
  return new QueueV2BoundedSeatLossStrategy(starvationThresholdSeconds);
}

type BoundedSeatLossOpportunity = {
  result: MatchmakingResult;
  diagnostic: ScarcityDiagnostic;
};

function boundedSeatLossOpportunities(
  input: MatchmakingInput,
  control: MatchmakingResult,
  thresholdSeconds: number,
  frozenGrace: MatchmakingStrategy,
): BoundedSeatLossOpportunity[] {
  const controlCount = countSeated(control);
  const controlSeatedIds = new Set(
    control.matches.flatMap((match) =>
      match.seats.map((seat) => seat.participantId),
    ),
  );
  const controlSeatByParticipant = new Map(
    control.matches.flatMap((match) =>
      match.seats.map((seat) => [seat.participantId, seat] as const),
    ),
  );
  const opportunities: BoundedSeatLossOpportunity[] = [];

  for (const participant of [...input.participants].sort(byParticipantOrder)) {
    const pools = participantPools(participant);
    const controlSeat = controlSeatByParticipant.get(participant.id);
    if (pools.length < 2 || !controlSeat) continue;
    const controlPoolId = controlSeat.poolId;

    for (const scarcePoolId of pools.filter(
      (poolId) => poolId !== controlPoolId,
    )) {
      const scarceCompatibleWithout = input.participants.filter(
        (entry) =>
          entry.id !== participant.id &&
          participantPools(entry).includes(scarcePoolId),
      );
      if (
        canFormLegalPod(
          scarceCompatibleWithout.length,
          input.settings.allowedSizes,
        ) ||
        !canFormLegalPod(
          scarceCompatibleWithout.length + 1,
          input.settings.allowedSizes,
        )
      ) {
        continue;
      }
      const exclusive = scarceCompatibleWithout.filter(
        (entry) => participantPools(entry).length === 1,
      );
      if (exclusive.length === 0) continue;
      const oldestExclusiveWaitSeconds = Math.max(
        ...exclusive.map((entry) => input.now - entry.readyAt),
      );
      if (oldestExclusiveWaitSeconds < thresholdSeconds) continue;

      const controlPoolAlternatives = input.participants.filter(
        (entry) =>
          entry.id !== participant.id &&
          participantPools(entry).includes(controlPoolId),
      );
      if (controlPoolAlternatives.length === 0) continue;

      const forcedLegacy: MatchmakingStrategy = {
        id: `legacy-v1-force-${participant.id}-${scarcePoolId}`,
        match: (value) =>
          matchLegacy(
            value,
            new Map([[participant.id, scarcePoolId]]),
          ),
      };
      const forcedGrace =
        frozenGrace instanceof QueueV2OpportunityGraceStrategy
          ? new QueueV2OpportunityGraceStrategy(
              frozenGrace.graceSeconds,
              frozenGrace.maxExistingWaitSeconds ??
                UNLIMITED_EXISTING_WAIT,
              forcedLegacy,
            )
          : createFrozenQueueV2GraceStrategy(forcedLegacy);
      const result = forcedGrace.match(input);
      const candidateCount = countSeated(result);
      if (controlCount - candidateCount !== 1) continue;
      const scarceMatch = result.matches.find(
        (match) =>
          match.poolId === scarcePoolId &&
          match.seats.some((seat) => seat.participantId === participant.id),
      );
      if (!scarceMatch) continue;
      const newlySeatedExclusiveParticipantIds = scarceMatch.seats
        .map((seat) => seat.participantId)
        .filter(
          (participantId) =>
            !controlSeatedIds.has(participantId) &&
            exclusive.some((entry) => entry.id === participantId),
        );
      if (newlySeatedExclusiveParticipantIds.length === 0) continue;

      opportunities.push({
        result,
        diagnostic: {
          type: 'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION',
          at: input.now,
          participantId: participant.id,
          preferredPoolId: preferredParticipantPool(participant),
          controlPoolId,
          scarcePoolId,
          exclusiveParticipantIds: exclusive.map((entry) => entry.id),
          newlySeatedExclusiveParticipantIds,
          oldestExclusiveWaitSeconds,
          preferredPoolAlternativeCount: controlPoolAlternatives.length,
          scarcePoolSubstituteCount: scarceCompatibleWithout.length,
          baselineSeatedCount: controlCount,
          candidateSeatedCount: candidateCount,
          immediateSeatLoss: 1,
          explicitlyAccepted: true,
          physicalTableAvailable: true,
        },
      });
    }
  }
  return opportunities;
}

function compareBoundedSeatLossOpportunity(
  left: BoundedSeatLossOpportunity,
  right: BoundedSeatLossOpportunity,
): number {
  if (
    left.diagnostic.oldestExclusiveWaitSeconds !==
    right.diagnostic.oldestExclusiveWaitSeconds
  ) {
    return (
      right.diagnostic.oldestExclusiveWaitSeconds -
      left.diagnostic.oldestExclusiveWaitSeconds
    );
  }
  const leftUnlocked =
    left.diagnostic.newlySeatedExclusiveParticipantIds?.length ?? 0;
  const rightUnlocked =
    right.diagnostic.newlySeatedExclusiveParticipantIds?.length ?? 0;
  if (leftUnlocked !== rightUnlocked) return rightUnlocked - leftUnlocked;
  const leftSubstitutes =
    left.diagnostic.scarcePoolSubstituteCount ?? Number.MAX_SAFE_INTEGER;
  const rightSubstitutes =
    right.diagnostic.scarcePoolSubstituteCount ?? Number.MAX_SAFE_INTEGER;
  if (leftSubstitutes !== rightSubstitutes) {
    return leftSubstitutes - rightSubstitutes;
  }
  return (
    left.diagnostic.scarcePoolId.localeCompare(
      right.diagnostic.scarcePoolId,
    ) ||
    left.diagnostic.participantId.localeCompare(
      right.diagnostic.participantId,
    )
  );
}

type ScarcityOpportunity = {
  result: MatchmakingResult;
  missed: ScarcityDiagnostic;
};

function scarcityOpportunities(
  input: MatchmakingInput,
  control: MatchmakingResult,
  thresholdSeconds: number,
): ScarcityOpportunity[] {
  const seatedCount = countSeated(control);
  const seatByParticipant = new Map(
    control.matches.flatMap((match) =>
      match.seats.map((seat) => [seat.participantId, seat] as const),
    ),
  );
  const opportunities: ScarcityOpportunity[] = [];

  for (const participant of [...input.participants].sort(byParticipantOrder)) {
    const pools = participantPools(participant);
    if (pools.length < 2) continue;
    const preferredPoolId = preferredParticipantPool(participant);
    const controlSeat = seatByParticipant.get(participant.id);
    if (!controlSeat || controlSeat.poolId !== preferredPoolId) continue;

    for (const scarcePoolId of pools.filter(
      (poolId) => poolId !== preferredPoolId,
    )) {
      const scarceCompatibleWithout = input.participants.filter(
        (entry) =>
          entry.id !== participant.id &&
          participantPools(entry).includes(scarcePoolId),
      );
      if (
        canFormLegalPod(scarceCompatibleWithout.length, input.settings.allowedSizes) ||
        !canFormLegalPod(
          scarceCompatibleWithout.length + 1,
          input.settings.allowedSizes,
        )
      ) {
        continue;
      }
      const exclusive = scarceCompatibleWithout.filter(
        (entry) => participantPools(entry).length === 1,
      );
      if (exclusive.length === 0) continue;
      const oldestExclusiveWaitSeconds = Math.max(
        ...exclusive.map((entry) => input.now - entry.readyAt),
      );
      if (oldestExclusiveWaitSeconds < thresholdSeconds) continue;

      const preferredAlternatives = input.participants.filter(
        (entry) =>
          entry.id !== participant.id &&
          participantPools(entry).includes(preferredPoolId),
      );
      if (
        preferredAlternatives.length < scarceCompatibleWithout.length
      ) {
        continue;
      }
      const preferredExclusive = preferredAlternatives.filter(
        (entry) => participantPools(entry).length === 1,
      );
      const oldestPreferredExclusiveWaitSeconds =
        preferredExclusive.length === 0
          ? 0
          : Math.max(
              ...preferredExclusive.map((entry) => input.now - entry.readyAt),
            );
      if (
        oldestExclusiveWaitSeconds <= oldestPreferredExclusiveWaitSeconds
      ) {
        continue;
      }

      const forcedLegacy: MatchmakingStrategy = {
        id: `legacy-v1-force-${participant.id}-${scarcePoolId}`,
        match: (value) =>
          matchLegacy(
            value,
            new Map([[participant.id, scarcePoolId]]),
          ),
      };
      const result = createFrozenQueueV2GraceStrategy(forcedLegacy).match(input);
      const candidateCount = countSeated(result);
      if (candidateCount < seatedCount) continue;
      const scarceMatch = result.matches.find(
        (match) =>
          match.poolId === scarcePoolId &&
          match.seats.some((seat) => seat.participantId === participant.id),
      );
      if (
        !scarceMatch ||
        !scarceMatch.seats.some((seat) =>
          exclusive.some(
            (exclusiveParticipant) =>
              exclusiveParticipant.id === seat.participantId,
          ),
        )
      ) {
        continue;
      }
      opportunities.push({
        result,
        missed: {
          type: 'MISSED_SCARCE_POOL_UNLOCK',
          at: input.now,
          participantId: participant.id,
          preferredPoolId,
          scarcePoolId,
          exclusiveParticipantIds: exclusive.map((entry) => entry.id),
          oldestExclusiveWaitSeconds,
          preferredPoolAlternativeCount: preferredAlternatives.length,
          baselineSeatedCount: seatedCount,
          candidateSeatedCount: candidateCount,
          explicitlyAccepted: true,
          physicalTableAvailable: true,
        },
      });
    }
  }
  return opportunities;
}

function compareScarcityOpportunity(
  left: ScarcityOpportunity,
  right: ScarcityOpportunity,
): number {
  if (left.missed.candidateSeatedCount !== right.missed.candidateSeatedCount) {
    return right.missed.candidateSeatedCount - left.missed.candidateSeatedCount;
  }
  if (
    left.missed.exclusiveParticipantIds.length !==
    right.missed.exclusiveParticipantIds.length
  ) {
    return (
      right.missed.exclusiveParticipantIds.length -
      left.missed.exclusiveParticipantIds.length
    );
  }
  if (
    left.missed.oldestExclusiveWaitSeconds !==
    right.missed.oldestExclusiveWaitSeconds
  ) {
    return (
      right.missed.oldestExclusiveWaitSeconds -
      left.missed.oldestExclusiveWaitSeconds
    );
  }
  return (
    left.missed.participantId.localeCompare(right.missed.participantId) ||
    left.missed.scarcePoolId.localeCompare(right.missed.scarcePoolId)
  );
}

function matchLegacy(
  input: MatchmakingInput,
  forcedPoolIds: ReadonlyMap<string, string> = new Map(),
): MatchmakingResult {
  const participants: ReadyParticipant[] = input.participants.map(
    (participant) => ({
      id: participant.id,
      readyAt: participant.readyAt,
      decks: participant.decks.map(toMatchDeck),
      flexCredits: participant.flexCredits,
    }),
  );
  const tables: AvailableTable[] = input.tables.map((table) => ({
    id: table.id,
  }));
  const history: MatchHistory = {
    groups: input.priorGroups.map((group) => [...group]),
  };
  const options: MatchOptions = {
    preferredSize: input.settings.preferredSize,
    allowedSizes: [...input.settings.allowedSizes],
  };
  return forcedPoolIds.size === 0
    ? createMatches(participants, tables, history, options)
    : createMatchesWithForcedPools(
        participants,
        tables,
        history,
        options,
        forcedPoolIds,
      );
}

function participantPools(participant: MatchmakingParticipant): string[] {
  return [...new Set(participant.decks.map((deck) => deck.poolId))];
}

function preferredParticipantPool(
  participant: MatchmakingParticipant,
): string {
  return (
    participant.decks.find((deck) => deck.preference === 'preferred')?.poolId ??
    participant.decks[0]?.poolId ??
    'open'
  );
}

function canFormLegalPod(
  compatibleCount: number,
  allowedSizes: readonly number[],
): boolean {
  return allowedSizes.some((size) => size <= compatibleCount);
}

function countSeated(result: MatchmakingResult): number {
  return result.matches.reduce((sum, match) => sum + match.seats.length, 0);
}

function byParticipantOrder(
  left: MatchmakingParticipant,
  right: MatchmakingParticipant,
): number {
  return left.readyAt - right.readyAt || left.id.localeCompare(right.id);
}

function toMatchDeck(deck: StrategyDeck): MatchDeck {
  return {
    id: deck.id,
    poolId: deck.poolId,
    preference: deck.preference,
  };
}
