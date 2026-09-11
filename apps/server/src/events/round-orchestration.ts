import { randomUUID } from 'node:crypto';
import {
  appendHistoryFromRound,
  assertRoundVersion,
  completeRound as completeRoundDomain,
  createRoundEventState,
  currentEventRound,
  generateDuelRound,
  generatePodRound,
  markPairingBasisStale,
  parseEventOperationMode,
  publishRound as publishRoundDomain,
  reoptimizeUnlockedAssignments,
  RoundGenerationError,
  startRound as startRoundDomain,
  swapPlayersBetweenAssignments,
  type DuelMatchOutcome,
  type EventOperationMode,
  type GameMode,
  type PublicEventRound,
  type RoundActivityKind,
  type RoundAuditEntry,
  type RoundEventState,
  type RoundParticipantInput,
  type RoundParticipantMeta,
  type RoundTableInput,
  type TablePreferenceKind,
} from '@podyguard/shared';
import { eventMatchOptions } from '@podyguard/matching';
import { InvalidEventInputError } from './validation.js';
import type { StoredEvent, StoredParticipant, StoredTable, StoredTableReservation } from './event-store.js';

export class RoundModeRequiredError extends Error {
  readonly code = 'ROUND_MODE_REQUIRED';

  constructor(
    message = 'This action requires a ROUNDS event. Use round generation instead of Match Now.',
  ) {
    super(message);
    this.name = 'RoundModeRequiredError';
  }
}

export class RoundVersionConflictError extends Error {
  readonly code = 'ROUND_CHANGED';

  constructor(message = 'This round changed. Refresh and try again.') {
    super(message);
    this.name = 'RoundVersionConflictError';
  }
}

export function resolveRoundActivityKind(gameMode: GameMode): RoundActivityKind {
  if (
    gameMode === 'duel' ||
    gameMode === 'duel-commander' ||
    gameMode === 'brawl'
  ) {
    return 'DUEL';
  }
  return 'POD';
}

export function initializeRoundStateForEvent(input: {
  gameMode: GameMode;
  preferredPodSize: number;
  allowThreePods: boolean;
  allowFivePods: boolean;
  roundCount?: number | 'AUTO';
  participantCount?: number;
}): RoundEventState {
  const matchOptions = eventMatchOptions({
    gameMode: input.gameMode,
    preferredPodSize: input.preferredPodSize,
    allowThreePods: input.allowThreePods,
    allowFivePods: input.allowFivePods,
  });
  return createRoundEventState({
    activityKind: resolveRoundActivityKind(input.gameMode),
    roundCount: input.roundCount ?? 'AUTO',
    participantCount: input.participantCount ?? 0,
    preferredPodSize: matchOptions.preferredSize ?? input.preferredPodSize,
    allowedPodSizes: matchOptions.allowedSizes ?? [input.preferredPodSize],
  });
}

export function requireRoundState(event: StoredEvent): RoundEventState {
  const mode = parseEventOperationMode(event.operationMode);
  if (mode !== 'ROUNDS' || !event.roundState) {
    throw new RoundModeRequiredError(
      'This event is not in ROUNDS mode. Create a ROUNDS event to use round actions.',
    );
  }
  return cloneRoundState(event.roundState);
}

export function assertRoundsOperationMode(event: StoredEvent): void {
  if (parseEventOperationMode(event.operationMode) !== 'ROUNDS') {
    throw new RoundModeRequiredError(
      'Match Now is only for rolling events. Use round generation for this ROUNDS event.',
    );
  }
}

export function assertRollingMatchAllowed(event: StoredEvent): void {
  if (parseEventOperationMode(event.operationMode) === 'ROUNDS') {
    throw new RoundModeRequiredError(
      'Match Now is only for rolling events. Use round generation for this ROUNDS event.',
    );
  }
}

export function parseOperationModeInput(
  value: unknown,
): EventOperationMode | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'ROLLING' || value === 'ROUNDS') {
    return value;
  }
  throw new InvalidEventInputError('Choose ROLLING or ROUNDS for operationMode.');
}

export function parseRoundCountInput(
  value: unknown,
): number | 'AUTO' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'AUTO') {
    return 'AUTO';
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return value;
  }
  throw new InvalidEventInputError(
    'roundCount must be AUTO or a positive integer.',
  );
}

export function syncRoundParticipants(
  state: RoundEventState,
  people: StoredParticipant[],
): RoundEventState {
  const byId = new Map(
    state.participants.map((participant) => [
      participant.participantId,
      participant,
    ]),
  );
  const next: RoundParticipantMeta[] = [];
  for (const person of people) {
    if (person.status === 'left') {
      const existing = byId.get(person.id);
      if (existing) {
        next.push({
          ...existing,
          status: existing.status === 'DROPPED' ? 'DROPPED' : 'DROPPED',
          droppedAt: existing.droppedAt ?? new Date().toISOString(),
        });
      }
      continue;
    }
    const existing = byId.get(person.id);
    const preference = coerceTablePreference(
      person.tablePreference ?? existing?.tablePreference,
    );
    next.push({
      participantId: person.id,
      status: existing?.status ?? 'REGISTERED',
      tablePreference: preference,
      lockedTableId: person.lockedTableId ?? existing?.lockedTableId,
      preferredTableId: person.preferredTableId ?? existing?.preferredTableId,
      droppedAt: existing?.droppedAt,
      lateRegisteredAt: existing?.lateRegisteredAt,
    });
  }
  return {
    ...state,
    participants: next,
    recommendedRoundCount: Math.max(
      state.recommendedRoundCount,
      recommendFromCount(
        next.filter((participant) => isEligibleMeta(participant)).length,
      ),
    ),
  };
}

function recommendFromCount(participantCount: number): number {
  if (participantCount <= 1) return 1;
  const raw = Math.ceil(Math.log2(participantCount));
  return Math.min(8, Math.max(3, raw));
}

export function toRoundParticipantInputs(
  state: RoundEventState,
  people: StoredParticipant[],
): RoundParticipantInput[] {
  const metaById = new Map(
    state.participants.map((participant) => [
      participant.participantId,
      participant,
    ]),
  );
  return people
    .filter((person) => person.status !== 'left')
    .map((person) => {
      const meta = metaById.get(person.id);
      const preference = coerceTablePreference(
        person.tablePreference ?? meta?.tablePreference,
      );
      return {
        participantId: person.id,
        displayName: person.displayName,
        eligible: meta ? isEligibleMeta(meta) : true,
        tablePreference: preference,
        lockedTableId: person.lockedTableId ?? meta?.lockedTableId,
        preferredTableId: person.preferredTableId ?? meta?.preferredTableId,
      };
    });
}

export function toRoundTableInputs(
  tables: StoredTable[],
  reservations: StoredTableReservation[] = [],
  options?: { roundId?: string },
): RoundTableInput[] {
  const byTableId = new Map(
    reservations.map((reservation) => [reservation.tableId, reservation]),
  );
  const roundPrefix = options?.roundId ? `${options.roundId}:` : null;
  return tables.map((table) => {
    const reservation = byTableId.get(table.id);
    let status: RoundTableInput['status'];
    if (table.status === 'disabled') {
      status = 'disabled';
    } else if (reservation) {
      const ownedByThisRound =
        roundPrefix &&
        reservation.ownerType === 'ROUND_ASSIGNMENT' &&
        reservation.ownerId.startsWith(roundPrefix);
      // Foreign claims block the generator; this-round claims stay assignable.
      status = ownedByThisRound ? 'free' : 'occupied';
    } else if (table.status === 'occupied') {
      status = 'occupied';
    } else {
      status = 'free';
    }
    return {
      id: table.id,
      label: table.label,
      status,
      zone: table.zone ?? undefined,
    };
  });
}

export function replaceCurrentRound(
  state: RoundEventState,
  round: PublicEventRound,
): RoundEventState {
  const without = state.rounds.filter((row) => row.number !== round.number);
  return {
    ...state,
    currentRoundNumber: round.number,
    rounds: [...without, round].sort((left, right) => left.number - right.number),
  };
}

export function appendRoundAudit(
  state: RoundEventState,
  entry: Omit<RoundAuditEntry, 'id' | 'at'> & { at?: string; id?: string },
): RoundEventState {
  return {
    ...state,
    audits: [
      ...state.audits,
      {
        id: entry.id ?? randomUUID(),
        at: entry.at ?? new Date().toISOString(),
        actor: entry.actor,
        action: entry.action,
        roundNumber: entry.roundNumber,
        affectedParticipantIds: entry.affectedParticipantIds,
        affectedTableIds: entry.affectedTableIds,
        beforeSummary: entry.beforeSummary,
        afterSummary: entry.afterSummary,
        reason: entry.reason,
      },
    ],
  };
}

export function guardRoundVersion(
  round: PublicEventRound,
  expectedVersion: number,
): void {
  try {
    assertRoundVersion(round, expectedVersion);
  } catch (error) {
    if (error instanceof Error && error.message === 'ROUND_CHANGED') {
      throw new RoundVersionConflictError();
    }
    throw error;
  }
}

export function generateNextRound(input: {
  state: RoundEventState;
  people: StoredParticipant[];
  tables: StoredTable[];
  reservations?: StoredTableReservation[];
  seedKey: string;
  now?: string;
  expectedVersion?: number;
}): RoundEventState {
  const synced = syncRoundParticipants(input.state, input.people);
  const current = currentEventRound(synced);
  if (current && (current.status === 'PUBLISHED' || current.status === 'ACTIVE')) {
    throw new InvalidEventInputError(
      'Finish or cancel the current round before generating another.',
    );
  }

  const regenerating = Boolean(current && current.status === 'PLANNING');
  if (regenerating) {
    if (input.expectedVersion === undefined) {
      throw new InvalidEventInputError(
        'expectedVersion is required when regenerating a planning round.',
      );
    }
    guardRoundVersion(current!, input.expectedVersion);
  }

  const roundNumber = regenerating
    ? current!.number
    : synced.currentRoundNumber + 1;
  const participants = toRoundParticipantInputs(synced, input.people);
  const tables = toRoundTableInputs(
    input.tables,
    input.reservations ?? [],
    regenerating && current ? { roundId: current.id } : undefined,
  );
  const pairingBasisVersion = synced.pairingBasisVersion;

  let round: PublicEventRound;
  try {
    round =
      synced.activityKind === 'DUEL'
        ? generateDuelRound({
            roundNumber,
            participants,
            tables,
            history: synced.fairness,
            pairingBasisVersion,
            seedKey: input.seedKey,
            now: input.now,
          })
        : generatePodRound({
            roundNumber,
            participants,
            tables,
            history: synced.fairness,
            preferredPodSize: synced.preferredPodSize,
            allowedPodSizes: synced.allowedPodSizes,
            pairingBasisVersion,
            seedKey: input.seedKey,
            now: input.now,
          });
  } catch (error) {
    if (error instanceof RoundGenerationError) {
      throw new InvalidEventInputError(error.message);
    }
    throw error;
  }

  const withRound = replaceCurrentRound(synced, round);
  const metrics = {
    ...withRound.metrics,
    roundsGenerated: withRound.metrics.roundsGenerated + (regenerating ? 0 : 1),
    roundsRegenerated:
      withRound.metrics.roundsRegenerated + (regenerating ? 1 : 0),
    fullRegenerations:
      withRound.metrics.fullRegenerations + (regenerating ? 1 : 0),
    byesAssigned:
      withRound.metrics.byesAssigned +
      round.assignments.filter((assignment) => assignment.isBye).length,
    shortPodsAssigned:
      withRound.metrics.shortPodsAssigned +
      round.assignments.filter(
        (assignment) =>
          !assignment.isBye &&
          assignment.participantIds.length < synced.preferredPodSize,
      ).length,
  };

  return appendRoundAudit(
    { ...withRound, metrics },
    {
      actor: 'host',
      action: regenerating ? 'regenerate_round' : 'generate_round',
      roundNumber: round.number,
      affectedParticipantIds: participants
        .filter((participant) => participant.eligible)
        .map((participant) => participant.participantId),
    },
  );
}

export function publishCurrentRound(
  state: RoundEventState,
  expectedVersion: number,
): RoundEventState {
  const current = requireCurrentRound(state);
  guardRoundVersion(current, expectedVersion);
  const published = publishRoundDomain(current);
  return appendRoundAudit(replaceCurrentRound(state, published), {
    actor: 'host',
    action: 'publish_round',
    roundNumber: published.number,
  });
}

export function startCurrentRound(
  state: RoundEventState,
  expectedVersion: number,
  now: string,
): RoundEventState {
  const current = requireCurrentRound(state);
  guardRoundVersion(current, expectedVersion);
  const started = startRoundDomain(current, state.durationSeconds, now);
  const withRound = replaceCurrentRound(state, started);
  return appendRoundAudit(
    {
      ...withRound,
      participants: withRound.participants.map((participant) => {
        const seated = started.assignments.some((assignment) =>
          assignment.participantIds.includes(participant.participantId),
        );
        if (!seated || participant.status === 'DROPPED') {
          return participant;
        }
        return { ...participant, status: 'PLAYING' as const };
      }),
    },
    {
      actor: 'host',
      action: 'start_round',
      roundNumber: started.number,
      at: now,
    },
  );
}

export function completeCurrentRound(
  state: RoundEventState,
  expectedVersion: number,
  now: string,
  options?: { force?: boolean; forceReason?: string },
): RoundEventState {
  const current = requireCurrentRound(state);
  guardRoundVersion(current, expectedVersion);
  const incomplete = current.assignments.filter(
    (assignment) => !assignment.isBye && assignment.status !== 'COMPLETED',
  );
  if (incomplete.length > 0 && !options?.force) {
    throw new InvalidEventInputError(
      'Complete all table results before finishing the round, or force-complete with a reason.',
    );
  }
  const completed = completeRoundDomain(current, now);
  const fairness = appendHistoryFromRound(
    state.fairness,
    completed,
    state.preferredPodSize,
  );
  const withRound = replaceCurrentRound(
    {
      ...state,
      fairness,
      pairingBasisVersion: state.pairingBasisVersion + 1,
      participants: state.participants.map((participant) => {
        if (participant.status === 'DROPPED' || participant.status === 'MISSING') {
          return participant;
        }
        return { ...participant, status: 'WAITING_FOR_NEXT_ROUND' as const };
      }),
    },
    completed,
  );
  return appendRoundAudit(withRound, {
    actor: 'host',
    action: 'complete_round',
    roundNumber: completed.number,
    at: now,
    reason: options?.force
      ? options.forceReason ?? 'Forced complete with incomplete results'
      : undefined,
  });
}

export function repairCurrentRound(input: {
  state: RoundEventState;
  expectedVersion: number;
  unlockedAssignmentIds: string[];
  people: StoredParticipant[];
  tables: StoredTable[];
  reservations?: StoredTableReservation[];
  seedKey: string;
}): RoundEventState {
  const current = requireCurrentRound(input.state);
  if (current.status !== 'PLANNING' && current.status !== 'PUBLISHED') {
    throw new InvalidEventInputError(
      'Only planning or published rounds can be repaired.',
    );
  }
  guardRoundVersion(current, input.expectedVersion);
  const unlocked = new Set(input.unlockedAssignmentIds);
  const lockedPlayers = current.assignments
    .filter((assignment) => !unlocked.has(assignment.id))
    .flatMap((assignment) => assignment.participantIds).length;
  let repaired: PublicEventRound;
  try {
    repaired = reoptimizeUnlockedAssignments({
      round: current,
      unlockedAssignmentIds: input.unlockedAssignmentIds,
      participants: toRoundParticipantInputs(input.state, input.people),
      tables: toRoundTableInputs(input.tables, input.reservations ?? [], {
        roundId: current.id,
      }),
      history: input.state.fairness,
      preferredPodSize: input.state.preferredPodSize,
      allowedPodSizes: input.state.allowedPodSizes,
      seedKey: input.seedKey,
    });
  } catch (error) {
    if (error instanceof RoundGenerationError) {
      throw new InvalidEventInputError(error.message);
    }
    throw error;
  }
  const affected = repaired.assignments
    .filter((assignment) => unlocked.has(assignment.id))
    .flatMap((assignment) => assignment.participantIds);
  return appendRoundAudit(
    {
      ...replaceCurrentRound(input.state, repaired),
      metrics: {
        ...input.state.metrics,
        localRepairs: input.state.metrics.localRepairs + 1,
        playersAffectedByRepair:
          input.state.metrics.playersAffectedByRepair + affected.length,
      },
    },
    {
      actor: 'host',
      action: 'repair_round',
      roundNumber: repaired.number,
      affectedParticipantIds: affected,
      beforeSummary: `${lockedPlayers} locked players preserved`,
    },
  );
}

export type RepairPreview = {
  before: PublicEventRound;
  after: PublicEventRound;
  affectedAssignmentIds: string[];
  movingParticipantIds: string[];
};

/** Pure preview of surgical repair — does not mutate event state. */
export function previewRepairRound(input: {
  state: RoundEventState;
  expectedVersion: number;
  unlockedAssignmentIds: string[];
  people: StoredParticipant[];
  tables: StoredTable[];
  reservations?: StoredTableReservation[];
  seedKey: string;
}): RepairPreview {
  const current = requireCurrentRound(input.state);
  if (current.status !== 'PLANNING' && current.status !== 'PUBLISHED') {
    throw new InvalidEventInputError(
      'Only planning or published rounds can be repaired.',
    );
  }
  guardRoundVersion(current, input.expectedVersion);
  const unlocked = new Set(input.unlockedAssignmentIds);
  let after: PublicEventRound;
  try {
    after = reoptimizeUnlockedAssignments({
      round: current,
      unlockedAssignmentIds: input.unlockedAssignmentIds,
      participants: toRoundParticipantInputs(input.state, input.people),
      tables: toRoundTableInputs(input.tables, input.reservations ?? [], {
        roundId: current.id,
      }),
      history: input.state.fairness,
      preferredPodSize: input.state.preferredPodSize,
      allowedPodSizes: input.state.allowedPodSizes,
      seedKey: input.seedKey,
    });
  } catch (error) {
    if (error instanceof RoundGenerationError) {
      throw new InvalidEventInputError(error.message);
    }
    throw error;
  }
  const affectedAssignmentIds = after.assignments
    .filter((assignment) => unlocked.has(assignment.id))
    .map((assignment) => assignment.id);
  const beforeById = new Map(
    current.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const movingParticipantIds = [
    ...new Set(
      affectedAssignmentIds.flatMap((assignmentId) => {
        const before = beforeById.get(assignmentId);
        const next = after.assignments.find((row) => row.id === assignmentId);
        if (!before || !next) return [];
        const beforeSet = new Set(before.participantIds);
        const afterSet = new Set(next.participantIds);
        return [
          ...before.participantIds.filter((id) => !afterSet.has(id)),
          ...next.participantIds.filter((id) => !beforeSet.has(id)),
        ];
      }),
    ),
  ];
  return {
    before: current,
    after,
    affectedAssignmentIds,
    movingParticipantIds,
  };
}

export function resolveStalePairingBasis(input: {
  state: RoundEventState;
  expectedVersion: number;
  decision: 'keep' | 'regenerate';
  people: StoredParticipant[];
  tables: StoredTable[];
  reservations?: StoredTableReservation[];
  seedKey: string;
  now?: string;
}): RoundEventState {
  const current = requireCurrentRound(input.state);
  guardRoundVersion(current, input.expectedVersion);
  if (!current.pairingBasisStale) {
    throw new InvalidEventInputError('Pairing basis is not marked stale.');
  }
  if (input.decision === 'keep') {
    const cleared: PublicEventRound = {
      ...current,
      pairingBasisStale: false,
      version: current.version + 1,
    };
    return appendRoundAudit(
      {
        ...replaceCurrentRound(input.state, cleared),
        metrics: {
          ...input.state.metrics,
          pairingKeptDespiteStaleBasis:
            input.state.metrics.pairingKeptDespiteStaleBasis + 1,
        },
      },
      {
        actor: 'host',
        action: 'keep_stale_pairings',
        roundNumber: cleared.number,
        reason: 'kept pairings despite stale basis',
      },
    );
  }
  if (current.status !== 'PLANNING' && current.status !== 'PUBLISHED') {
    throw new InvalidEventInputError(
      'Only planning or published rounds can be regenerated for a stale basis.',
    );
  }
  // Drop back to a regenerate path from planning-equivalent inputs.
  const planningState: RoundEventState = {
    ...input.state,
    rounds: input.state.rounds.map((round) =>
      round.id === current.id
        ? { ...round, status: 'PLANNING' as const, pairingBasisStale: false }
        : round,
    ),
  };
  return generateNextRound({
    state: planningState,
    people: input.people,
    tables: input.tables,
    reservations: input.reservations,
    seedKey: input.seedKey,
    now: input.now,
    expectedVersion: current.version,
  });
}

export function swapCurrentRoundPlayers(input: {
  state: RoundEventState;
  expectedVersion: number;
  leftAssignmentId: string;
  leftParticipantId: string;
  rightAssignmentId: string;
  rightParticipantId: string;
}): RoundEventState {
  const current = requireCurrentRound(input.state);
  if (current.status !== 'PLANNING' && current.status !== 'PUBLISHED') {
    throw new InvalidEventInputError(
      'Only planning or published rounds can be edited.',
    );
  }
  guardRoundVersion(current, input.expectedVersion);
  try {
    const swapped = swapPlayersBetweenAssignments(
      current,
      input.leftAssignmentId,
      input.leftParticipantId,
      input.rightAssignmentId,
      input.rightParticipantId,
    );
    return appendRoundAudit(
      {
        ...replaceCurrentRound(input.state, swapped),
        metrics: {
          ...input.state.metrics,
          manualAssignments: input.state.metrics.manualAssignments + 1,
        },
      },
      {
        actor: 'host',
        action: 'swap_players',
        roundNumber: swapped.number,
        affectedParticipantIds: [
          input.leftParticipantId,
          input.rightParticipantId,
        ],
      },
    );
  } catch (error) {
    throw new InvalidEventInputError(
      error instanceof Error ? error.message : 'Unable to swap players.',
    );
  }
}

export function reportAssignmentResult(input: {
  state: RoundEventState;
  expectedVersion: number;
  assignmentId: string;
  outcome?: DuelMatchOutcome;
  playerAGameWins?: number;
  playerBGameWins?: number;
  actor: RoundAuditEntry['actor'];
}): RoundEventState {
  const current = requireCurrentRound(input.state);
  if (current.status !== 'ACTIVE') {
    throw new InvalidEventInputError('Results can only be reported on an active round.');
  }
  guardRoundVersion(current, input.expectedVersion);
  const assignment = current.assignments.find(
    (row) => row.id === input.assignmentId,
  );
  if (!assignment) {
    throw new InvalidEventInputError('Assignment not found in the current round.');
  }
  if (assignment.isBye) {
    throw new InvalidEventInputError('Bye assignments are already complete.');
  }
  if (current.activityKind === 'DUEL' && !input.outcome) {
    throw new InvalidEventInputError('Choose a duel match outcome.');
  }
  const nextAssignment = {
    ...assignment,
    status: 'COMPLETED' as const,
    outcome: input.outcome ?? assignment.outcome,
    playerAGameWins: input.playerAGameWins ?? assignment.playerAGameWins,
    playerBGameWins: input.playerBGameWins ?? assignment.playerBGameWins,
  };
  const nextRound: PublicEventRound = {
    ...current,
    version: current.version + 1,
    assignments: current.assignments.map((row) =>
      row.id === assignment.id ? nextAssignment : row,
    ),
  };
  return appendRoundAudit(replaceCurrentRound(input.state, nextRound), {
    actor: input.actor,
    action: 'report_result',
    roundNumber: nextRound.number,
    affectedParticipantIds: assignment.participantIds,
  });
}

export function correctPriorAssignmentResult(input: {
  state: RoundEventState;
  expectedVersion: number;
  roundNumber: number;
  assignmentId: string;
  outcome?: DuelMatchOutcome;
  playerAGameWins?: number;
  playerBGameWins?: number;
  reason?: string;
}): RoundEventState {
  const current = currentEventRound(input.state);
  if (current) {
    guardRoundVersion(current, input.expectedVersion);
  }
  const target = input.state.rounds.find(
    (round) => round.number === input.roundNumber,
  );
  if (!target || target.status !== 'COMPLETED') {
    throw new InvalidEventInputError(
      'Only completed prior rounds can be corrected.',
    );
  }
  const assignment = target.assignments.find(
    (row) => row.id === input.assignmentId,
  );
  if (!assignment) {
    throw new InvalidEventInputError('Assignment not found in that round.');
  }
  const correctedRound: PublicEventRound = {
    ...target,
    version: target.version + 1,
    assignments: target.assignments.map((row) =>
      row.id === assignment.id
        ? {
            ...row,
            outcome: input.outcome ?? row.outcome,
            playerAGameWins: input.playerAGameWins ?? row.playerAGameWins,
            playerBGameWins: input.playerBGameWins ?? row.playerBGameWins,
            status: 'COMPLETED' as const,
          }
        : row,
    ),
  };
  const rebuiltFairness = input.state.rounds
    .filter((round) => round.status === 'COMPLETED')
    .map((round) =>
      round.number === correctedRound.number ? correctedRound : round,
    )
    .reduce(
      (history, round) =>
        appendHistoryFromRound(history, round, input.state.preferredPodSize),
      { pods: [] as RoundEventState['fairness']['pods'], duels: [] as RoundEventState['fairness']['duels'] },
    );

  let next: RoundEventState = {
    ...input.state,
    fairness: rebuiltFairness,
    pairingBasisVersion: input.state.pairingBasisVersion + 1,
    rounds: input.state.rounds.map((round) =>
      round.number === correctedRound.number ? correctedRound : round,
    ),
    metrics: {
      ...input.state.metrics,
      previousResultsCorrected: input.state.metrics.previousResultsCorrected + 1,
    },
  };

  const live = currentEventRound(next);
  if (
    live &&
    (live.status === 'PLANNING' ||
      live.status === 'PUBLISHED' ||
      live.status === 'ACTIVE')
  ) {
    const stale = markPairingBasisStale(live);
    next = replaceCurrentRound(next, stale);
  }

  return appendRoundAudit(next, {
    actor: 'host',
    action: 'correct_prior_result',
    roundNumber: correctedRound.number,
    affectedParticipantIds: assignment.participantIds,
    reason: input.reason,
  });
}

export function dropRoundParticipantMeta(
  state: RoundEventState,
  participantId: string,
  now: string,
  expectedVersion?: number,
): RoundEventState {
  const current = currentEventRound(state);
  if (current && expectedVersion !== undefined) {
    guardRoundVersion(current, expectedVersion);
  } else if (current && expectedVersion === undefined) {
    throw new InvalidEventInputError('expectedVersion is required.');
  }
  const exists = state.participants.some(
    (participant) => participant.participantId === participantId,
  );
  if (!exists) {
    throw new InvalidEventInputError('Participant is not in round state.');
  }
  let next: RoundEventState = {
    ...state,
    participants: state.participants.map((participant) =>
      participant.participantId === participantId
        ? {
            ...participant,
            status: 'DROPPED' as const,
            droppedAt: now,
          }
        : participant,
    ),
    metrics: {
      ...state.metrics,
      drops: state.metrics.drops + 1,
    },
  };
  if (current) {
    next = replaceCurrentRound(next, {
      ...current,
      version: current.version + 1,
    });
  }
  return appendRoundAudit(next, {
    actor: 'host',
    action: 'drop_participant',
    affectedParticipantIds: [participantId],
    at: now,
  });
}

export function markMissingRoundParticipantMeta(
  state: RoundEventState,
  participantId: string,
  now: string,
  expectedVersion: number,
): RoundEventState {
  const current = requireCurrentRound(state);
  guardRoundVersion(current, expectedVersion);
  const exists = state.participants.some(
    (participant) => participant.participantId === participantId,
  );
  if (!exists) {
    throw new InvalidEventInputError('Participant is not in round state.');
  }
  return appendRoundAudit(
    {
      ...replaceCurrentRound(state, {
        ...current,
        version: current.version + 1,
      }),
      participants: state.participants.map((participant) =>
        participant.participantId === participantId
          ? { ...participant, status: 'MISSING' as const }
          : participant,
      ),
    },
    {
      actor: 'host',
      action: 'mark_missing',
      affectedParticipantIds: [participantId],
      at: now,
    },
  );
}

export function lateRegisterRoundParticipantMeta(
  state: RoundEventState,
  participantId: string,
  now: string,
  expectedVersion?: number,
): RoundEventState {
  const current = currentEventRound(state);
  if (current && expectedVersion !== undefined) {
    guardRoundVersion(current, expectedVersion);
  } else if (current && expectedVersion === undefined) {
    throw new InvalidEventInputError('expectedVersion is required.');
  }
  const existing = state.participants.find(
    (participant) => participant.participantId === participantId,
  );
  const participants = existing
    ? state.participants.map((participant) =>
        participant.participantId === participantId
          ? {
              ...participant,
              status: 'LATE' as const,
              lateRegisteredAt: now,
              droppedAt: undefined,
            }
          : participant,
      )
    : [
        ...state.participants,
        {
          participantId,
          status: 'LATE' as const,
          tablePreference: 'none' as const,
          lateRegisteredAt: now,
        },
      ];
  let next: RoundEventState = {
    ...state,
    participants,
    metrics: {
      ...state.metrics,
      lateRegistrations: state.metrics.lateRegistrations + 1,
    },
  };
  if (current) {
    next = replaceCurrentRound(next, {
      ...current,
      version: current.version + 1,
    });
  }
  return appendRoundAudit(next, {
    actor: 'host',
    action: 'late_register',
    affectedParticipantIds: [participantId],
    at: now,
  });
}

export function setRoundParticipantTableLock(input: {
  state: RoundEventState;
  expectedVersion: number;
  participantId: string;
  tablePreference: TablePreferenceKind;
  lockedTableId?: string | null;
  preferredTableId?: string | null;
}): RoundEventState {
  const current = requireCurrentRound(input.state);
  guardRoundVersion(current, input.expectedVersion);
  const exists = input.state.participants.some(
    (participant) => participant.participantId === input.participantId,
  );
  if (!exists) {
    throw new InvalidEventInputError('Participant is not in round state.');
  }
  const usedLock = input.tablePreference === 'locked';
  return appendRoundAudit(
    {
      ...replaceCurrentRound(input.state, {
        ...current,
        version: current.version + 1,
      }),
      participants: input.state.participants.map((participant) =>
        participant.participantId === input.participantId
          ? {
              ...participant,
              tablePreference: input.tablePreference,
              lockedTableId:
                input.tablePreference === 'locked'
                  ? input.lockedTableId ?? undefined
                  : undefined,
              preferredTableId:
                input.tablePreference === 'preferred'
                  ? input.preferredTableId ?? undefined
                  : input.tablePreference === 'locked'
                    ? undefined
                    : participant.preferredTableId,
            }
          : participant,
      ),
      metrics: {
        ...input.state.metrics,
        tableLocksUsed:
          input.state.metrics.tableLocksUsed + (usedLock ? 1 : 0),
      },
    },
    {
      actor: 'host',
      action: 'set_table_lock',
      affectedParticipantIds: [input.participantId],
      affectedTableIds: [
        ...(input.lockedTableId ? [input.lockedTableId] : []),
        ...(input.preferredTableId ? [input.preferredTableId] : []),
      ],
    },
  );
}

function requireCurrentRound(state: RoundEventState): PublicEventRound {
  const current = currentEventRound(state);
  if (!current) {
    throw new InvalidEventInputError('Generate a round first.');
  }
  return current;
}

function isEligibleMeta(meta: RoundParticipantMeta): boolean {
  return (
    meta.status === 'REGISTERED' ||
    meta.status === 'WAITING_FOR_NEXT_ROUND' ||
    meta.status === 'LATE' ||
    meta.status === 'ASSIGNED'
  );
}

function coerceTablePreference(
  value: string | undefined,
): TablePreferenceKind {
  if (value === 'preferred' || value === 'locked' || value === 'none') {
    return value;
  }
  return 'none';
}

function cloneRoundState(state: RoundEventState): RoundEventState {
  return structuredClone(state);
}
