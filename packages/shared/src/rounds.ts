/**
 * Synchronous round / tournament operation mode.
 *
 * Orthogonal to game format: Commander may be ROLLING or ROUNDS.
 * Does not replace the frozen rolling Commander matcher
 * (opportunity grace 120s / maxExistingWait 600s in simulation).
 *
 * Product boundary: Swiss-like / structured rounds for casual and
 * unsanctioned events. Not a WPN/EventLink/MTR replacement.
 */

export const EVENT_OPERATION_MODES = ['ROLLING', 'ROUNDS'] as const;
export type EventOperationMode = (typeof EVENT_OPERATION_MODES)[number];

export const ROUND_STATUSES = [
  'PLANNING',
  'PUBLISHED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const ROUND_ACTIVITY_KINDS = ['POD', 'DUEL'] as const;
export type RoundActivityKind = (typeof ROUND_ACTIVITY_KINDS)[number];

export const ROUND_ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'PLAYING',
  'COMPLETED',
  'BYE',
  'UNASSIGNED',
] as const;
export type RoundAssignmentStatus =
  (typeof ROUND_ASSIGNMENT_STATUSES)[number];

export const DUEL_MATCH_OUTCOMES = [
  'PLAYER_A_WIN',
  'PLAYER_B_WIN',
  'DRAW',
  'BYE',
] as const;
export type DuelMatchOutcome = (typeof DUEL_MATCH_OUTCOMES)[number];

export const TABLE_PREFERENCE_KINDS = ['none', 'preferred', 'locked'] as const;
export type TablePreferenceKind = (typeof TABLE_PREFERENCE_KINDS)[number];

/** Operational fairness weights for complete pod-round plans (not competitive scoring). */
export const ROUND_FAIRNESS_WEIGHTS = {
  repeatPair: 100,
  exactPodRepeat: 1_000,
  nonPreferredSize: 250,
  consecutiveNonPreferred: 400,
  unseated: 1_000_000,
  tableLockViolation: 1_000_000,
} as const;

export const DUEL_MATCH_POINTS = {
  win: 3,
  draw: 1,
  loss: 0,
  bye: 3,
} as const;

export type RoundTableInput = {
  id: string;
  label: string;
  status: 'free' | 'occupied' | 'disabled' | 'unavailable' | 'reserved';
  zone?: string;
};

export type RoundParticipantInput = {
  participantId: string;
  displayName: string;
  /** Eligible for the next generated round. */
  eligible: boolean;
  tablePreference?: TablePreferenceKind;
  lockedTableId?: string;
  preferredTableId?: string;
};

export type RoundHistoryPod = {
  roundNumber: number;
  participantIds: readonly string[];
  preferredSize: number;
};

export type RoundHistoryDuel = {
  roundNumber: number;
  playerAId: string;
  playerBId?: string;
  outcome?: DuelMatchOutcome;
  isBye?: boolean;
};

export type RoundFairnessHistory = {
  pods: RoundHistoryPod[];
  duels: RoundHistoryDuel[];
};

export type RoundAssignment = {
  id: string;
  position: number;
  tableId?: string;
  tableLabel?: string;
  participantIds: string[];
  locked: boolean;
  status: RoundAssignmentStatus;
  isBye?: boolean;
  explanation?: string;
  outcome?: DuelMatchOutcome;
  playerAGameWins?: number;
  playerBGameWins?: number;
  timeExtensionSeconds?: number;
};

export type PublicEventRound = {
  id: string;
  number: number;
  status: RoundStatus;
  version: number;
  activityKind: RoundActivityKind;
  assignments: RoundAssignment[];
  unassignedParticipantIds: string[];
  pairingBasisVersion: number;
  pairingBasisStale: boolean;
  startedAt?: string;
  durationSeconds?: number;
  pausedAt?: string;
  remainingSecondsWhenPaused?: number;
  completedAt?: string;
  explanations: string[];
  generatedAt: string;
};

export type RoundParticipantMeta = {
  participantId: string;
  status:
    | 'REGISTERED'
    | 'WAITING_FOR_NEXT_ROUND'
    | 'ASSIGNED'
    | 'PLAYING'
    | 'DROPPED'
    | 'MISSING'
    | 'LATE';
  tablePreference: TablePreferenceKind;
  lockedTableId?: string;
  preferredTableId?: string;
  droppedAt?: string;
  lateRegisteredAt?: string;
};

export type RoundAuditEntry = {
  id: string;
  at: string;
  actor: 'host' | 'system' | 'participant';
  action: string;
  roundNumber?: number;
  affectedParticipantIds?: string[];
  affectedTableIds?: string[];
  beforeSummary?: string;
  afterSummary?: string;
  reason?: string;
};

export type RoundEventState = {
  activityKind: RoundActivityKind;
  roundCount: number | 'AUTO';
  recommendedRoundCount: number;
  durationSeconds: number;
  preferredPodSize: number;
  allowedPodSizes: number[];
  currentRoundNumber: number;
  pairingBasisVersion: number;
  rounds: PublicEventRound[];
  fairness: RoundFairnessHistory;
  participants: RoundParticipantMeta[];
  audits: RoundAuditEntry[];
  metrics: RoundModeMetrics;
};

export type RoundModeMetrics = {
  roundsGenerated: number;
  roundsRegenerated: number;
  localRepairs: number;
  playersAffectedByRepair: number;
  fullRegenerations: number;
  manualAssignments: number;
  byesAssigned: number;
  shortPodsAssigned: number;
  unavoidableRepeatPairs: number;
  previousResultsCorrected: number;
  pairingKeptDespiteStaleBasis: number;
  tableLocksUsed: number;
  lateRegistrations: number;
  drops: number;
};

export type GeneratePodRoundInput = {
  roundNumber: number;
  roundId?: string;
  participants: readonly RoundParticipantInput[];
  tables: readonly RoundTableInput[];
  history: RoundFairnessHistory;
  preferredPodSize: number;
  allowedPodSizes: readonly number[];
  pairingBasisVersion: number;
  now?: string;
  /** Deterministic salt for tie-breaks (e.g. event id). */
  seedKey?: string;
};

export type GenerateDuelRoundInput = {
  roundNumber: number;
  roundId?: string;
  participants: readonly RoundParticipantInput[];
  tables: readonly RoundTableInput[];
  history: RoundFairnessHistory;
  pairingBasisVersion: number;
  now?: string;
  seedKey?: string;
};

export type RoundConfigConflict = {
  code: 'TABLE_LOCK_CONFLICT' | 'INSUFFICIENT_TABLES' | 'INFEASIBLE_SIZES';
  message: string;
  participantIds?: string[];
  tableIds?: string[];
};

export class RoundGenerationError extends Error {
  readonly conflicts: RoundConfigConflict[];

  constructor(message: string, conflicts: RoundConfigConflict[] = []) {
    super(message);
    this.name = 'RoundGenerationError';
    this.conflicts = conflicts;
  }
}

export function isEventOperationMode(value: unknown): value is EventOperationMode {
  return (
    typeof value === 'string' &&
    (EVENT_OPERATION_MODES as readonly string[]).includes(value)
  );
}

export function parseEventOperationMode(
  value: unknown,
  fallback: EventOperationMode = 'ROLLING',
): EventOperationMode {
  return isEventOperationMode(value) ? value : fallback;
}

/** Casual recommendation: roughly log2(n) rounded, clamped 3–8. */
export function recommendRoundCount(participantCount: number): number {
  if (participantCount <= 1) return 1;
  const raw = Math.ceil(Math.log2(participantCount));
  return Math.min(8, Math.max(3, raw));
}

export function emptyRoundFairnessHistory(): RoundFairnessHistory {
  return { pods: [], duels: [] };
}

export function emptyRoundMetrics(): RoundModeMetrics {
  return {
    roundsGenerated: 0,
    roundsRegenerated: 0,
    localRepairs: 0,
    playersAffectedByRepair: 0,
    fullRegenerations: 0,
    manualAssignments: 0,
    byesAssigned: 0,
    shortPodsAssigned: 0,
    unavoidableRepeatPairs: 0,
    previousResultsCorrected: 0,
    pairingKeptDespiteStaleBasis: 0,
    tableLocksUsed: 0,
    lateRegistrations: 0,
    drops: 0,
  };
}

export function createRoundEventState(input: {
  activityKind: RoundActivityKind;
  roundCount?: number | 'AUTO';
  participantCount: number;
  preferredPodSize: number;
  allowedPodSizes: readonly number[];
  durationSeconds?: number;
  participants?: RoundParticipantMeta[];
}): RoundEventState {
  const recommended = recommendRoundCount(input.participantCount);
  const roundCount = input.roundCount ?? 'AUTO';
  return {
    activityKind: input.activityKind,
    roundCount,
    recommendedRoundCount: recommended,
    durationSeconds: input.durationSeconds ?? 50 * 60,
    preferredPodSize: input.preferredPodSize,
    allowedPodSizes: [...input.allowedPodSizes].sort((a, b) => a - b),
    currentRoundNumber: 0,
    pairingBasisVersion: 0,
    rounds: [],
    fairness: emptyRoundFairnessHistory(),
    participants: input.participants ?? [],
    audits: [],
    metrics: emptyRoundMetrics(),
  };
}

export function resolveRoundCount(state: RoundEventState): number {
  return state.roundCount === 'AUTO'
    ? state.recommendedRoundCount
    : state.roundCount;
}

export function currentEventRound(
  state: RoundEventState,
): PublicEventRound | undefined {
  if (state.currentRoundNumber <= 0) return undefined;
  return state.rounds.find((round) => round.number === state.currentRoundNumber);
}

export function shortPodCountByPlayer(
  history: RoundFairnessHistory,
  preferredPodSize: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pod of history.pods) {
    if (pod.participantIds.length >= preferredPodSize) continue;
    for (const id of pod.participantIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export function pairShareCount(
  history: RoundFairnessHistory,
  left: string,
  right: string,
): number {
  const key = pairKey(left, right);
  let count = 0;
  for (const pod of history.pods) {
    const set = new Set(pod.participantIds);
    if (set.has(left) && set.has(right)) count += 1;
  }
  for (const duel of history.duels) {
    if (!duel.playerBId || duel.isBye) continue;
    if (pairKey(duel.playerAId, duel.playerBId) === key) count += 1;
  }
  return count;
}

export function byeCountByPlayer(history: RoundFairnessHistory): Map<string, number> {
  const counts = new Map<string, number>();
  for (const duel of history.duels) {
    if (!duel.isBye && duel.outcome !== 'BYE') continue;
    counts.set(duel.playerAId, (counts.get(duel.playerAId) ?? 0) + 1);
  }
  return counts;
}

export function computeDuelStandings(
  participantIds: readonly string[],
  history: RoundFairnessHistory,
): Array<{
  participantId: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  matchPoints: number;
}> {
  const rows = new Map(
    participantIds.map((id) => [
      id,
      {
        participantId: id,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        byes: 0,
        matchPoints: 0,
      },
    ]),
  );
  for (const duel of history.duels) {
    if (duel.isBye || duel.outcome === 'BYE') {
      const row = rows.get(duel.playerAId);
      if (!row) continue;
      row.matches += 1;
      row.byes += 1;
      row.wins += 1;
      row.matchPoints += DUEL_MATCH_POINTS.bye;
      continue;
    }
    if (!duel.playerBId || !duel.outcome) continue;
    const a = rows.get(duel.playerAId);
    const b = rows.get(duel.playerBId);
    if (!a || !b) continue;
    a.matches += 1;
    b.matches += 1;
    if (duel.outcome === 'PLAYER_A_WIN') {
      a.wins += 1;
      b.losses += 1;
      a.matchPoints += DUEL_MATCH_POINTS.win;
      b.matchPoints += DUEL_MATCH_POINTS.loss;
    } else if (duel.outcome === 'PLAYER_B_WIN') {
      b.wins += 1;
      a.losses += 1;
      b.matchPoints += DUEL_MATCH_POINTS.win;
      a.matchPoints += DUEL_MATCH_POINTS.loss;
    } else if (duel.outcome === 'DRAW') {
      a.draws += 1;
      b.draws += 1;
      a.matchPoints += DUEL_MATCH_POINTS.draw;
      b.matchPoints += DUEL_MATCH_POINTS.draw;
    }
  }
  return [...rows.values()].sort(
    (left, right) =>
      right.matchPoints - left.matchPoints ||
      right.wins - left.wins ||
      left.participantId.localeCompare(right.participantId),
  );
}

/**
 * Partition N players into allowed pod sizes, preferring as many preferred-size
 * pods as possible. Remainder uses the largest feasible allowed size.
 */
export function planPodSizes(
  playerCount: number,
  preferredPodSize: number,
  allowedPodSizes: readonly number[],
): number[] {
  const allowed = [...new Set(allowedPodSizes)]
    .filter((size) => size >= 2)
    .sort((a, b) => b - a);
  if (!allowed.includes(preferredPodSize)) {
    allowed.push(preferredPodSize);
    allowed.sort((a, b) => b - a);
  }
  if (playerCount === 0) return [];
  if (!canPartition(playerCount, allowed)) {
    throw new RoundGenerationError('No legal pod-size partition for this field.', [
      {
        code: 'INFEASIBLE_SIZES',
        message: `Cannot partition ${playerCount} players into sizes [${allowed.join(', ')}].`,
      },
    ]);
  }

  const preferredCount = Math.floor(playerCount / preferredPodSize);
  for (let usePreferred = preferredCount; usePreferred >= 0; usePreferred -= 1) {
    const remaining = playerCount - usePreferred * preferredPodSize;
    if (remaining === 0) {
      return Array.from({ length: usePreferred }, () => preferredPodSize);
    }
    const rest = partitionExact(remaining, allowed);
    if (rest) {
      return [
        ...Array.from({ length: usePreferred }, () => preferredPodSize),
        ...rest,
      ].sort((a, b) => b - a);
    }
  }
  const fallback = partitionExact(playerCount, allowed);
  if (!fallback) {
    throw new RoundGenerationError('No legal pod-size partition for this field.', [
      {
        code: 'INFEASIBLE_SIZES',
        message: `Cannot partition ${playerCount} players into sizes [${allowed.join(', ')}].`,
      },
    ]);
  }
  return fallback.sort((a, b) => b - a);
}

export function generatePodRound(input: GeneratePodRoundInput): PublicEventRound {
  const now = input.now ?? new Date().toISOString();
  const eligible = input.participants
    .filter((participant) => participant.eligible)
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
  const conflicts = detectTableLockConflicts(eligible, input.tables);
  if (conflicts.length > 0) {
    throw new RoundGenerationError('Table lock conflicts prevent generation.', conflicts);
  }

  const sizes = planPodSizes(
    eligible.length,
    input.preferredPodSize,
    input.allowedPodSizes,
  );
  const availableTables = input.tables
    .filter((table) => table.status === 'free' || table.status === 'reserved')
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
  if (availableTables.length < sizes.length) {
    throw new RoundGenerationError('Not enough tables for this round.', [
      {
        code: 'INSUFFICIENT_TABLES',
        message: `Need ${sizes.length} tables, have ${availableTables.length}.`,
      },
    ]);
  }

  const pods = searchPodAssignment({
    players: eligible.map((participant) => participant.participantId),
    sizes,
    history: input.history,
    preferredPodSize: input.preferredPodSize,
    seedKey: input.seedKey ?? '',
  });

  const assignments = assignTablesToPods({
    pods,
    tables: availableTables,
    participants: eligible,
    preferredPodSize: input.preferredPodSize,
    history: input.history,
  });

  const explanations = assignments
    .map((assignment) => assignment.explanation)
    .filter((value): value is string => Boolean(value));

  return {
    id: input.roundId ?? `round-${input.roundNumber}`,
    number: input.roundNumber,
    status: 'PLANNING',
    version: 1,
    activityKind: 'POD',
    assignments,
    unassignedParticipantIds: [],
    pairingBasisVersion: input.pairingBasisVersion,
    pairingBasisStale: false,
    explanations,
    generatedAt: now,
  };
}

export function generateDuelRound(input: GenerateDuelRoundInput): PublicEventRound {
  const now = input.now ?? new Date().toISOString();
  const eligible = input.participants
    .filter((participant) => participant.eligible)
    .sort((left, right) => left.participantId.localeCompare(right.participantId));
  const conflicts = detectTableLockConflicts(eligible, input.tables);
  if (conflicts.length > 0) {
    throw new RoundGenerationError('Table lock conflicts prevent generation.', conflicts);
  }

  const standings = computeDuelStandings(
    eligible.map((participant) => participant.participantId),
    input.history,
  );
  const ranked = standings
    .filter((row) => eligible.some((participant) => participant.participantId === row.participantId))
    .map((row) => row.participantId);

  let byeId: string | undefined;
  let pairedIds = ranked;
  if (ranked.length % 2 === 1) {
    byeId = chooseFairBye(ranked, input.history);
    pairedIds = ranked.filter((id) => id !== byeId);
  }

  const pairs = optimalDuelPairs(pairedIds, standings, input.history);
  const availableTables = input.tables
    .filter((table) => table.status === 'free' || table.status === 'reserved')
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));

  const matchCount = pairs.length + (byeId ? 1 : 0);
  if (availableTables.length < pairs.length) {
    throw new RoundGenerationError('Not enough tables for this round.', [
      {
        code: 'INSUFFICIENT_TABLES',
        message: `Need ${pairs.length} tables, have ${availableTables.length}.`,
      },
    ]);
  }

  const assignments: RoundAssignment[] = [];
  let tableIndex = 0;
  let position = 1;
  for (const pair of pairs) {
    const table = pickTableForPlayers(
      pair,
      availableTables.slice(tableIndex),
      eligible,
    );
    if (!table) {
      throw new RoundGenerationError('Unable to honor table locks while seating duels.');
    }
    tableIndex = availableTables.findIndex((entry) => entry.id === table.id) + 1;
    const rematch = pairShareCount(input.history, pair[0]!, pair[1]!) > 0;
    assignments.push({
      id: `r${input.roundNumber}-m${position}`,
      position,
      tableId: table.id,
      tableLabel: table.label,
      participantIds: [...pair].sort((a, b) => a.localeCompare(b)),
      locked: false,
      status: 'ASSIGNED',
      explanation: rematch
        ? `Rematch between prior opponents was unavoidable for a legal Swiss pairing.`
        : 'No prior matchup.',
    });
    position += 1;
  }
  if (byeId) {
    assignments.push({
      id: `r${input.roundNumber}-bye`,
      position,
      participantIds: [byeId],
      locked: false,
      status: 'BYE',
      isBye: true,
      outcome: 'BYE',
      explanation: 'Bye assigned by lowest bye-count then standings position.',
    });
  }

  void matchCount;
  return {
    id: input.roundId ?? `round-${input.roundNumber}`,
    number: input.roundNumber,
    status: 'PLANNING',
    version: 1,
    activityKind: 'DUEL',
    assignments,
    unassignedParticipantIds: [],
    pairingBasisVersion: input.pairingBasisVersion,
    pairingBasisStale: false,
    explanations: assignments
      .map((assignment) => assignment.explanation)
      .filter((value): value is string => Boolean(value)),
    generatedAt: now,
  };
}

export function publishRound(round: PublicEventRound): PublicEventRound {
  assertTransition(round.status, 'PUBLISHED');
  return { ...round, status: 'PUBLISHED', version: round.version + 1 };
}

export function startRound(
  round: PublicEventRound,
  durationSeconds: number,
  now = new Date().toISOString(),
): PublicEventRound {
  assertTransition(round.status, 'ACTIVE');
  return {
    ...round,
    status: 'ACTIVE',
    version: round.version + 1,
    startedAt: now,
    durationSeconds,
    pausedAt: undefined,
    remainingSecondsWhenPaused: undefined,
    assignments: round.assignments.map((assignment) =>
      assignment.isBye || assignment.status === 'BYE'
        ? { ...assignment, status: 'COMPLETED', outcome: assignment.outcome ?? 'BYE' }
        : { ...assignment, status: 'PLAYING' },
    ),
  };
}

export function completeRound(
  round: PublicEventRound,
  now = new Date().toISOString(),
): PublicEventRound {
  assertTransition(round.status, 'COMPLETED');
  return {
    ...round,
    status: 'COMPLETED',
    version: round.version + 1,
    completedAt: now,
  };
}

export function cancelRound(round: PublicEventRound): PublicEventRound {
  if (round.status === 'COMPLETED') {
    throw new Error('Cannot cancel a completed round.');
  }
  return { ...round, status: 'CANCELLED', version: round.version + 1 };
}

export function assertRoundVersion(round: PublicEventRound, expectedVersion: number): void {
  if (round.version !== expectedVersion) {
    throw new Error('ROUND_CHANGED');
  }
}

/**
 * Surgical repair: re-optimize only unlocked assignments.
 * Every locked assignment must remain byte-identical.
 */
export function reoptimizeUnlockedAssignments(input: {
  round: PublicEventRound;
  unlockedAssignmentIds: readonly string[];
  participants: readonly RoundParticipantInput[];
  tables: readonly RoundTableInput[];
  history: RoundFairnessHistory;
  preferredPodSize: number;
  allowedPodSizes: readonly number[];
  seedKey?: string;
}): PublicEventRound {
  const unlocked = new Set(input.unlockedAssignmentIds);
  const lockedAssignments = input.round.assignments.filter(
    (assignment) => !unlocked.has(assignment.id),
  );
  const unlockedAssignments = input.round.assignments.filter((assignment) =>
    unlocked.has(assignment.id),
  );
  if (unlockedAssignments.length === 0) {
    return input.round;
  }

  const lockedPlayerIds = new Set(
    lockedAssignments.flatMap((assignment) => assignment.participantIds),
  );
  const freePlayers = unlockedAssignments
    .flatMap((assignment) => assignment.participantIds)
    .filter((id) => !lockedPlayerIds.has(id));
  const freeTables = unlockedAssignments
    .map((assignment) => assignment.tableId)
    .filter((id): id is string => Boolean(id));

  const participantInputs = input.participants
    .filter((participant) => freePlayers.includes(participant.participantId))
    .map((participant) => ({ ...participant, eligible: true }));

  const tableInputs = input.tables
    .filter((table) => freeTables.includes(table.id))
    .map((table) => ({ ...table, status: 'free' as const }));

  const repaired =
    input.round.activityKind === 'DUEL'
      ? generateDuelRound({
          roundNumber: input.round.number,
          roundId: `${input.round.id}-repair`,
          participants: participantInputs,
          tables: tableInputs,
          history: input.history,
          pairingBasisVersion: input.round.pairingBasisVersion,
          seedKey: `${input.seedKey ?? ''}:repair:${[...unlocked].sort().join(',')}`,
        })
      : generatePodRound({
          roundNumber: input.round.number,
          roundId: `${input.round.id}-repair`,
          participants: participantInputs,
          tables: tableInputs,
          history: input.history,
          preferredPodSize: input.preferredPodSize,
          allowedPodSizes: input.allowedPodSizes,
          pairingBasisVersion: input.round.pairingBasisVersion,
          seedKey: `${input.seedKey ?? ''}:repair:${[...unlocked].sort().join(',')}`,
        });

  const merged = [
    ...lockedAssignments.map((assignment) => ({ ...assignment, locked: true })),
    ...repaired.assignments.map((assignment, index) => ({
      ...assignment,
      id: unlockedAssignments[index]?.id ?? assignment.id,
      position: unlockedAssignments[index]?.position ?? assignment.position,
      locked: false,
    })),
  ].sort((left, right) => left.position - right.position);

  const next: PublicEventRound = {
    ...input.round,
    version: input.round.version + 1,
    assignments: merged,
    explanations: [
      ...input.round.explanations,
      `Local repair over ${unlockedAssignments.length} assignment(s).`,
      ...repaired.explanations,
    ],
  };
  assertLockedAssignmentsUnchanged(input.round, next, [...unlocked]);
  return next;
}

export function swapPlayersBetweenAssignments(
  round: PublicEventRound,
  leftAssignmentId: string,
  leftParticipantId: string,
  rightAssignmentId: string,
  rightParticipantId: string,
): PublicEventRound {
  const left = round.assignments.find((assignment) => assignment.id === leftAssignmentId);
  const right = round.assignments.find((assignment) => assignment.id === rightAssignmentId);
  if (!left || !right) throw new Error('Assignment not found.');
  if (!left.participantIds.includes(leftParticipantId)) {
    throw new Error('Left player is not seated at the left assignment.');
  }
  if (!right.participantIds.includes(rightParticipantId)) {
    throw new Error('Right player is not seated at the right assignment.');
  }
  const nextAssignments = round.assignments.map((assignment) => {
    if (assignment.id === leftAssignmentId) {
      return {
        ...assignment,
        participantIds: assignment.participantIds
          .map((id) => (id === leftParticipantId ? rightParticipantId : id))
          .sort((a, b) => a.localeCompare(b)),
      };
    }
    if (assignment.id === rightAssignmentId) {
      return {
        ...assignment,
        participantIds: assignment.participantIds
          .map((id) => (id === rightParticipantId ? leftParticipantId : id))
          .sort((a, b) => a.localeCompare(b)),
      };
    }
    return assignment;
  });
  const next = {
    ...round,
    version: round.version + 1,
    assignments: nextAssignments,
  };
  assertLockedAssignmentsUnchanged(round, next, [leftAssignmentId, rightAssignmentId]);
  return next;
}

export function moveAssignmentToTable(
  round: PublicEventRound,
  assignmentId: string,
  table: RoundTableInput,
): PublicEventRound {
  if (table.status === 'disabled' || table.status === 'unavailable') {
    throw new Error('Table is unavailable.');
  }
  if (
    round.assignments.some(
      (assignment) => assignment.tableId === table.id && assignment.id !== assignmentId,
    )
  ) {
    throw new Error('Table is already used in this round.');
  }
  return {
    ...round,
    version: round.version + 1,
    assignments: round.assignments.map((assignment) =>
      assignment.id === assignmentId
        ? { ...assignment, tableId: table.id, tableLabel: table.label }
        : assignment,
    ),
  };
}

export function assertLockedAssignmentsUnchanged(
  before: PublicEventRound,
  after: PublicEventRound,
  unlockedAssignmentIds: readonly string[],
): void {
  const unlocked = new Set(unlockedAssignmentIds);
  for (const prior of before.assignments) {
    if (unlocked.has(prior.id)) continue;
    const next = after.assignments.find((assignment) => assignment.id === prior.id);
    if (!next) {
      throw new Error(`Locked assignment ${prior.id} was removed.`);
    }
    if (
      next.tableId !== prior.tableId ||
      next.tableLabel !== prior.tableLabel ||
      next.isBye !== prior.isBye ||
      sortedKey(next.participantIds) !== sortedKey(prior.participantIds)
    ) {
      throw new Error(`Locked assignment ${prior.id} changed during repair.`);
    }
  }
}

export function appendHistoryFromRound(
  history: RoundFairnessHistory,
  round: PublicEventRound,
  preferredPodSize: number,
): RoundFairnessHistory {
  if (round.activityKind === 'POD') {
    return {
      ...history,
      pods: [
        ...history.pods,
        ...round.assignments
          .filter((assignment) => !assignment.isBye)
          .map((assignment) => ({
            roundNumber: round.number,
            participantIds: [...assignment.participantIds].sort(),
            preferredSize: preferredPodSize,
          })),
      ],
    };
  }
  return {
    ...history,
    duels: [
      ...history.duels,
      ...round.assignments.map((assignment) => {
        if (assignment.isBye || assignment.participantIds.length === 1) {
          return {
            roundNumber: round.number,
            playerAId: assignment.participantIds[0]!,
            isBye: true,
            outcome: 'BYE' as const,
          };
        }
        const [playerAId, playerBId] = [...assignment.participantIds].sort();
        return {
          roundNumber: round.number,
          playerAId: playerAId!,
          playerBId,
          outcome: assignment.outcome,
        };
      }),
    ],
  };
}

export function markPairingBasisStale(round: PublicEventRound): PublicEventRound {
  return { ...round, pairingBasisStale: true, version: round.version + 1 };
}

export function roundProgress(round: PublicEventRound): {
  complete: number;
  total: number;
  waiting: RoundAssignment[];
} {
  const counted = round.assignments.filter((assignment) => !assignment.isBye);
  const complete = counted.filter((assignment) => assignment.status === 'COMPLETED').length;
  return {
    complete,
    total: counted.length,
    waiting: counted.filter((assignment) => assignment.status !== 'COMPLETED'),
  };
}

export function attentionItems(
  state: RoundEventState,
  options?: {
    tableConflicts?: Array<{ tableId: string; message: string }>;
  },
): Array<{
  code: string;
  message: string;
  roundNumber?: number;
  assignmentId?: string;
  participantId?: string;
  tableId?: string;
}> {
  const items: Array<{
    code: string;
    message: string;
    roundNumber?: number;
    assignmentId?: string;
    participantId?: string;
    tableId?: string;
  }> = [];
  const current = currentEventRound(state);
  if (!current) return items;
  if (current.pairingBasisStale) {
    items.push({
      code: 'PAIRING_BASIS_STALE',
      message: `Round ${current.number} pairings may be stale after a prior-result correction.`,
      roundNumber: current.number,
    });
  }
  if (current.status === 'ACTIVE') {
    const progress = roundProgress(current);
    for (const waiting of progress.waiting) {
      items.push({
        code: 'RESULT_MISSING',
        message: `Table ${waiting.tableLabel ?? waiting.position} still needs a result.`,
        roundNumber: current.number,
        assignmentId: waiting.id,
      });
    }
    if (progress.waiting.length === 0 && progress.total > 0) {
      items.push({
        code: 'ROUND_READY_TO_COMPLETE',
        message: `Round ${current.number} has all results and is ready to complete.`,
        roundNumber: current.number,
      });
    }
  }
  const seatedIds = new Set(
    current.assignments.flatMap((assignment) => assignment.participantIds),
  );
  for (const meta of state.participants) {
    if (meta.status === 'MISSING') {
      items.push({
        code: 'PLAYER_MISSING',
        message: `Player ${meta.participantId} marked missing.`,
        participantId: meta.participantId,
      });
    }
    if (meta.status === 'DROPPED' && seatedIds.has(meta.participantId)) {
      items.push({
        code: 'DROPPED_STILL_SEATED',
        message: `Dropped player ${meta.participantId} is still seated in the current round.`,
        participantId: meta.participantId,
        roundNumber: current.number,
      });
    }
    if (
      meta.status === 'LATE' &&
      (current.status === 'PUBLISHED' || current.status === 'ACTIVE') &&
      !seatedIds.has(meta.participantId)
    ) {
      items.push({
        code: 'LATE_WAITING',
        message: `Late registrant ${meta.participantId} is waiting for the next round.`,
        participantId: meta.participantId,
      });
    }
  }
  for (const conflict of options?.tableConflicts ?? []) {
    items.push({
      code: 'TABLE_CONFLICT',
      message: conflict.message,
      tableId: conflict.tableId,
    });
  }
  return items;
}

function assertTransition(from: RoundStatus, to: RoundStatus): void {
  const allowed: Record<RoundStatus, RoundStatus[]> = {
    PLANNING: ['PUBLISHED', 'CANCELLED', 'PLANNING'],
    PUBLISHED: ['ACTIVE', 'PLANNING', 'CANCELLED'],
    ACTIVE: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (to !== from && !allowed[from].includes(to)) {
    throw new Error(`Invalid round transition ${from} → ${to}.`);
  }
}

function detectTableLockConflicts(
  participants: readonly RoundParticipantInput[],
  tables: readonly RoundTableInput[],
): RoundConfigConflict[] {
  const conflicts: RoundConfigConflict[] = [];
  const lockOwners = new Map<string, string[]>();
  for (const participant of participants) {
    if (participant.tablePreference !== 'locked' || !participant.lockedTableId) continue;
    const table = tables.find((entry) => entry.id === participant.lockedTableId);
    if (!table || table.status === 'disabled' || table.status === 'unavailable') {
      conflicts.push({
        code: 'TABLE_LOCK_CONFLICT',
        message: `${participant.displayName} is locked to an unavailable table.`,
        participantIds: [participant.participantId],
        tableIds: participant.lockedTableId ? [participant.lockedTableId] : [],
      });
      continue;
    }
    const owners = lockOwners.get(participant.lockedTableId) ?? [];
    owners.push(participant.participantId);
    lockOwners.set(participant.lockedTableId, owners);
  }
  for (const [tableId, owners] of lockOwners) {
    const table = tables.find((entry) => entry.id === tableId);
    // Multiple hard locks on one table are only legal if they fit one pod together;
    // conflicting exclusive locks (more owners than any single pod can hold) error.
    if (owners.length > 5) {
      conflicts.push({
        code: 'TABLE_LOCK_CONFLICT',
        message: `Too many hard locks on table ${table?.label ?? tableId}.`,
        participantIds: owners,
        tableIds: [tableId],
      });
    }
  }
  return conflicts;
}

function searchPodAssignment(input: {
  players: readonly string[];
  sizes: readonly number[];
  history: RoundFairnessHistory;
  preferredPodSize: number;
  seedKey: string;
}): string[][] {
  const shortCounts = shortPodCountByPlayer(input.history, input.preferredPodSize);
  const lastShortRound = new Map<string, number>();
  for (const pod of input.history.pods) {
    if (pod.participantIds.length >= input.preferredPodSize) continue;
    for (const id of pod.participantIds) {
      lastShortRound.set(id, Math.max(lastShortRound.get(id) ?? 0, pod.roundNumber));
    }
  }

  const scorePlan = (pods: readonly string[][]): number =>
    pods.reduce(
      (total, pod) =>
        total +
        scorePod(
          pod,
          input.history,
          input.preferredPodSize,
          shortCounts,
          lastShortRound,
        ),
      0,
    );

  // Exact complete-plan search for typical Commander room sizes.
  if (input.players.length <= 12) {
    const plans = enumerateSizePartitions([...input.players], [...input.sizes]);
    if (plans.length === 0) {
      throw new RoundGenerationError('Failed to seat every eligible player.');
    }
    plans.sort(
      (left, right) =>
        scorePlan(left) - scorePlan(right) ||
        podsKey(left).localeCompare(podsKey(right)) ||
        `${input.seedKey}:${podsKey(left)}`.localeCompare(
          `${input.seedKey}:${podsKey(right)}`,
        ),
    );
    return plans[0]!;
  }

  // Beam search over complete plans for larger fields. Fill short pods first so
  // low short-pod-burden players are available for non-preferred sizes.
  const sizes = [...input.sizes].sort((a, b) => a - b || b - a);
  type Beam = { remaining: string[]; pods: string[][]; score: number };
  let beams: Beam[] = [
    {
      remaining: [...input.players].sort((a, b) => a.localeCompare(b)),
      pods: [],
      score: 0,
    },
  ];
  const beamWidth = Math.min(48, Math.max(12, input.players.length));

  for (const size of sizes) {
    const nextBeams: Beam[] = [];
    for (const beam of beams) {
      const combinations = chooseAnchoredCombinations({
        players: beam.remaining,
        size,
        limit: beamWidth * 4,
        history: input.history,
        preferredPodSize: input.preferredPodSize,
        shortCounts,
        lastShortRound,
        fillingShortPod: size < input.preferredPodSize,
      });
      for (const combo of combinations) {
        const comboSet = new Set(combo);
        const remaining = beam.remaining.filter((id) => !comboSet.has(id));
        const pods = [...beam.pods, combo];
        nextBeams.push({
          remaining,
          pods,
          score: scorePlan(pods),
        });
      }
    }
    nextBeams.sort(
      (left, right) =>
        left.score - right.score ||
        podsKey(left.pods).localeCompare(podsKey(right.pods)),
    );
    beams = nextBeams.slice(0, beamWidth);
  }

  const best = beams.find((beam) => beam.remaining.length === 0);
  if (!best) {
    throw new RoundGenerationError('Failed to seat every eligible player.');
  }
  return [...best.pods].sort((left, right) =>
    `${input.seedKey}:${sortedKey(left)}`.localeCompare(
      `${input.seedKey}:${sortedKey(right)}`,
    ),
  );
}

function enumerateSizePartitions(
  players: readonly string[],
  sizes: readonly number[],
): string[][][] {
  const remainingSizes = [...sizes].sort((a, b) => b - a);
  const results: string[][][] = [];
  const seen = new Set<string>();

  function walk(
    remaining: readonly string[],
    sizesLeft: readonly number[],
    pods: string[][],
  ): void {
    if (sizesLeft.length === 0) {
      if (remaining.length === 0) {
        const normalized = pods.map((pod) =>
          [...pod].sort((a, b) => a.localeCompare(b)),
        );
        const key = podsKey(normalized);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(normalized);
        }
      }
      return;
    }
    const size = sizesLeft[0]!;
    const restSizes = sizesLeft.slice(1);
    const combos = combinationsOf(
      [...remaining].sort((a, b) => a.localeCompare(b)),
      size,
      50_000,
    );
    for (const combo of combos) {
      const comboSet = new Set(combo);
      walk(
        remaining.filter((id) => !comboSet.has(id)),
        restSizes,
        [...pods, combo],
      );
    }
  }

  walk(players, remainingSizes, []);
  return results;
}

/**
 * Anchor one player, then try partner sets. For short pods, prefer players with
 * the lowest prior short-pod burden as the anchor so burdens rotate.
 */
function chooseAnchoredCombinations(input: {
  players: readonly string[];
  size: number;
  limit: number;
  history: RoundFairnessHistory;
  preferredPodSize: number;
  shortCounts: Map<string, number>;
  lastShortRound: Map<string, number>;
  fillingShortPod: boolean;
}): string[][] {
  if (input.size > input.players.length) return [];
  const ordered = [...input.players].sort((left, right) => {
    if (input.fillingShortPod) {
      const burden =
        (input.shortCounts.get(left) ?? 0) - (input.shortCounts.get(right) ?? 0);
      if (burden !== 0) return burden;
      const recent =
        (input.lastShortRound.get(left) ?? 0) -
        (input.lastShortRound.get(right) ?? 0);
      if (recent !== 0) return recent;
    }
    return left.localeCompare(right);
  });
  const anchor = ordered[0]!;
  const others = ordered.slice(1);
  const partnerCombos = combinationsOf(others, input.size - 1, input.limit);
  const scored = partnerCombos
    .map((partners) => {
      const combo = [anchor, ...partners].sort((a, b) => a.localeCompare(b));
      return {
        combo,
        score: scorePod(
          combo,
          input.history,
          input.preferredPodSize,
          input.shortCounts,
          input.lastShortRound,
        ),
      };
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        sortedKey(left.combo).localeCompare(sortedKey(right.combo)),
    );
  return scored.slice(0, input.limit).map((entry) => entry.combo);
}

function combinationsOf(
  values: readonly string[],
  size: number,
  limit: number,
): string[][] {
  if (size === 0) return [[]];
  if (size > values.length) return [];
  const results: string[][] = [];
  function walk(start: number, chosen: string[]): void {
    if (results.length >= limit) return;
    if (chosen.length === size) {
      results.push([...chosen]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      chosen.push(values[index]!);
      walk(index + 1, chosen);
      chosen.pop();
      if (results.length >= limit) return;
    }
  }
  walk(0, []);
  return results;
}

function scorePod(
  participantIds: readonly string[],
  history: RoundFairnessHistory,
  preferredPodSize: number,
  shortCounts: Map<string, number>,
  lastShortRound: Map<string, number>,
): number {
  let score = 0;
  for (let i = 0; i < participantIds.length; i += 1) {
    for (let j = i + 1; j < participantIds.length; j += 1) {
      score +=
        pairShareCount(history, participantIds[i]!, participantIds[j]!) *
        ROUND_FAIRNESS_WEIGHTS.repeatPair;
    }
  }
  const key = sortedKey(participantIds);
  if (
    history.pods.some(
      (pod) => sortedKey(pod.participantIds) === key,
    )
  ) {
    score += ROUND_FAIRNESS_WEIGHTS.exactPodRepeat;
  }
  if (participantIds.length < preferredPodSize) {
    for (const id of participantIds) {
      score += (shortCounts.get(id) ?? 0) * ROUND_FAIRNESS_WEIGHTS.nonPreferredSize;
      if ((lastShortRound.get(id) ?? 0) > 0) {
        score += ROUND_FAIRNESS_WEIGHTS.consecutiveNonPreferred;
      }
    }
  }
  return score;
}

function assignTablesToPods(input: {
  pods: readonly string[][];
  tables: readonly RoundTableInput[];
  participants: readonly RoundParticipantInput[];
  preferredPodSize: number;
  history: RoundFairnessHistory;
}): RoundAssignment[] {
  const byId = new Map(
    input.participants.map((participant) => [participant.participantId, participant]),
  );
  const usedTables = new Set<string>();
  const shortCounts = shortPodCountByPlayer(input.history, input.preferredPodSize);
  const assignments: RoundAssignment[] = [];

  input.pods.forEach((pod, index) => {
    const locked = pod
      .map((id) => byId.get(id))
      .find((participant) => participant?.tablePreference === 'locked' && participant.lockedTableId);
    let table: RoundTableInput | undefined;
    if (locked?.lockedTableId) {
      table = input.tables.find(
        (entry) => entry.id === locked.lockedTableId && !usedTables.has(entry.id),
      );
      if (!table) {
        throw new RoundGenerationError('Unable to honor a hard table lock.', [
          {
            code: 'TABLE_LOCK_CONFLICT',
            message: `Locked table unavailable for pod.`,
            participantIds: [...pod],
            tableIds: [locked.lockedTableId],
          },
        ]);
      }
    } else {
      const preferred = pod
        .map((id) => byId.get(id))
        .find(
          (participant) =>
            participant?.tablePreference === 'preferred' && participant.preferredTableId,
        );
      table =
        (preferred?.preferredTableId
          ? input.tables.find(
              (entry) =>
                entry.id === preferred.preferredTableId && !usedTables.has(entry.id),
            )
          : undefined) ??
        input.tables.find((entry) => !usedTables.has(entry.id));
    }
    if (!table) {
      throw new RoundGenerationError('Ran out of tables while assigning pods.');
    }
    usedTables.add(table.id);

    const repeatPairs: string[] = [];
    for (let i = 0; i < pod.length; i += 1) {
      for (let j = i + 1; j < pod.length; j += 1) {
        if (pairShareCount(input.history, pod[i]!, pod[j]!) > 0) {
          repeatPairs.push(`${pod[i]}-${pod[j]}`);
        }
      }
    }
    let explanation =
      repeatPairs.length === 0
        ? `Table ${table.label}: no repeated tablemates.`
        : `Table ${table.label}: repeats ${repeatPairs.join(', ')} were unavoidable without worse global cost.`;
    if (pod.length < input.preferredPodSize) {
      const burdens = pod.map((id) => `${id}:${shortCounts.get(id) ?? 0}`).join(', ');
      explanation += ` Short pod assigned (prior short counts ${burdens}).`;
    }

    assignments.push({
      id: `pod-${index + 1}`,
      position: index + 1,
      tableId: table.id,
      tableLabel: table.label,
      participantIds: [...pod].sort((a, b) => a.localeCompare(b)),
      locked: false,
      status: 'ASSIGNED',
      explanation,
    });
  });

  return assignments;
}

function chooseFairBye(
  ranked: readonly string[],
  history: RoundFairnessHistory,
): string {
  const byeCounts = byeCountByPlayer(history);
  const minimum = Math.min(...ranked.map((id) => byeCounts.get(id) ?? 0));
  const candidates = ranked.filter((id) => (byeCounts.get(id) ?? 0) === minimum);
  const rankIndex = new Map(ranked.map((id, index) => [id, index]));
  return [...candidates].sort(
    (left, right) =>
      (rankIndex.get(right) ?? 0) - (rankIndex.get(left) ?? 0) ||
      right.localeCompare(left),
  )[0]!;
}

function optimalDuelPairs(
  rankedIds: readonly string[],
  standings: ReturnType<typeof computeDuelStandings>,
  history: RoundFairnessHistory,
): string[][] {
  if (rankedIds.length % 2 !== 0) {
    throw new Error('Duel pairing requires an even field after bye selection.');
  }
  const points = new Map(standings.map((row) => [row.participantId, row.matchPoints]));
  const rank = new Map(rankedIds.map((id, index) => [id, index]));
  const memo = new Map<string, { pairs: string[][]; rematches: number; gap: number; key: string }>();

  function solve(ids: readonly string[]): {
    pairs: string[][];
    rematches: number;
    gap: number;
    key: string;
  } {
    if (ids.length === 0) {
      return { pairs: [], rematches: 0, gap: 0, key: '' };
    }
    const memoKey = [...ids].sort().join('|');
    const cached = memo.get(memoKey);
    if (cached) return cached;

    const [first, ...rest] = ids;
    let best: { pairs: string[][]; rematches: number; gap: number; key: string } | undefined;
    for (let index = 0; index < rest.length; index += 1) {
      const partner = rest[index]!;
      const remaining = [...rest.slice(0, index), ...rest.slice(index + 1)];
      const child = solve(remaining);
      const rematch = pairShareCount(history, first!, partner) > 0 ? 1 : 0;
      const gap = Math.abs((points.get(first!) ?? 0) - (points.get(partner) ?? 0));
      const candidate = {
        pairs: [[first!, partner], ...child.pairs],
        rematches: child.rematches + rematch,
        gap: child.gap + gap,
        key: `${pairKey(first!, partner)}|${child.key}`,
      };
      if (
        !best ||
        candidate.rematches < best.rematches ||
        (candidate.rematches === best.rematches && candidate.gap < best.gap) ||
        (candidate.rematches === best.rematches &&
          candidate.gap === best.gap &&
          candidate.key.localeCompare(best.key) < 0)
      ) {
        best = candidate;
      }
    }
    const result = best ?? { pairs: [], rematches: 0, gap: 0, key: '' };
    memo.set(memoKey, result);
    void rank;
    return result;
  }

  return solve(rankedIds).pairs;
}

function pickTableForPlayers(
  playerIds: readonly string[],
  tables: readonly RoundTableInput[],
  participants: readonly RoundParticipantInput[],
): RoundTableInput | undefined {
  const byId = new Map(
    participants.map((participant) => [participant.participantId, participant]),
  );
  for (const playerId of playerIds) {
    const participant = byId.get(playerId);
    if (participant?.tablePreference === 'locked' && participant.lockedTableId) {
      return tables.find((table) => table.id === participant.lockedTableId);
    }
  }
  for (const playerId of playerIds) {
    const participant = byId.get(playerId);
    if (participant?.tablePreference === 'preferred' && participant.preferredTableId) {
      const preferred = tables.find((table) => table.id === participant.preferredTableId);
      if (preferred) return preferred;
    }
  }
  return tables[0];
}

function canPartition(total: number, sizes: readonly number[]): boolean {
  const reachable = new Set([0]);
  for (const size of sizes) {
    const next = new Set(reachable);
    for (const value of reachable) {
      let cursor = value + size;
      while (cursor <= total) {
        next.add(cursor);
        cursor += size;
      }
    }
    for (const value of next) reachable.add(value);
  }
  return reachable.has(total);
}

function partitionExact(
  total: number,
  sizes: readonly number[],
): number[] | undefined {
  const sorted = [...sizes].sort((a, b) => b - a);
  const memo = new Map<number, number[] | null>();

  function solve(remaining: number): number[] | null {
    if (remaining === 0) return [];
    if (memo.has(remaining)) return memo.get(remaining) ?? null;
    for (const size of sorted) {
      if (size > remaining) continue;
      const child = solve(remaining - size);
      if (child) {
        const result = [size, ...child];
        memo.set(remaining, result);
        return result;
      }
    }
    memo.set(remaining, null);
    return null;
  }
  return solve(total) ?? undefined;
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

function sortedKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

function podsKey(pods: readonly string[][]): string {
  return pods.map((pod) => sortedKey(pod)).sort().join('/');
}
