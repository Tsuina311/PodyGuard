import type { SeriesLength } from './tournament';

export const LIMITED_MODES = [
  'BOOSTER_DRAFT',
  'PICK_TWO_DRAFT',
  'SEALED',
] as const;

export type LimitedMode = (typeof LIMITED_MODES)[number];

export const LIMITED_SESSION_STATUSES = [
  'FORMING',
  'SEATING',
  'DRAFTING',
  'DECKBUILDING',
  'ROUND_ACTIVE',
  'BETWEEN_ROUNDS',
  'COMPLETED',
  'CANCELLED',
] as const;

export type LimitedSessionStatus =
  (typeof LIMITED_SESSION_STATUSES)[number];

export type LimitedParticipantStatus =
  | 'QUEUED'
  | 'ASSIGNED'
  | 'DRAFTING'
  | 'DECKBUILDING'
  | 'WAITING_FOR_ROUND'
  | 'PLAYING'
  | 'COMPLETED'
  | 'DROPPED';

export type LimitedMatchStructure = 'BO1' | 'BO3';
export type LimitedPairingPolicy = 'SWISS' | 'PICK_TWO_FOUR_PLAYER';

export type LimitedModeConfig = {
  mode: LimitedMode;
  hasDraftPhase: boolean;
  cardsPerPick?: 1 | 2;
  boosterPacksPerPlayer: number;
  preferredCohortSize?: number;
  minCohortSize: number;
  maxCohortSize?: number;
  defaultRounds: number | 'AUTO';
  draftMinutes?: number;
  deckbuildingMinutes: number;
  roundMinutes: number;
  supportedMatchStructures: readonly LimitedMatchStructure[];
  minimumDeckCards: 40;
  pairingPolicy: LimitedPairingPolicy;
};

/** Organizer-facing configuration for one Limited queue at a global event. */
export type LimitedEventModeConfig = {
  mode: LimitedMode;
  enabled: boolean;
  matchStructure: LimitedMatchStructure;
  preferredCohortSize?: number;
  minCohortSize: number;
  maxCohortSize?: number;
  allowUndersizedLaunch: boolean;
  totalRounds: number | 'AUTO';
  draftMinutes?: number;
  deckbuildingMinutes: number;
  roundMinutes: number;
};

export const LIMITED_MODE_CONFIGS: Readonly<
  Record<LimitedMode, LimitedModeConfig>
> = {
  BOOSTER_DRAFT: {
    mode: 'BOOSTER_DRAFT',
    hasDraftPhase: true,
    cardsPerPick: 1,
    boosterPacksPerPlayer: 3,
    preferredCohortSize: 8,
    minCohortSize: 8,
    maxCohortSize: 8,
    defaultRounds: 'AUTO',
    draftMinutes: 50,
    deckbuildingMinutes: 30,
    roundMinutes: 50,
    supportedMatchStructures: ['BO1', 'BO3'],
    minimumDeckCards: 40,
    pairingPolicy: 'SWISS',
  },
  PICK_TWO_DRAFT: {
    mode: 'PICK_TWO_DRAFT',
    hasDraftPhase: true,
    cardsPerPick: 2,
    boosterPacksPerPlayer: 3,
    preferredCohortSize: 4,
    minCohortSize: 4,
    maxCohortSize: 4,
    defaultRounds: 'AUTO',
    draftMinutes: 50,
    deckbuildingMinutes: 30,
    roundMinutes: 50,
    supportedMatchStructures: ['BO1', 'BO3'],
    minimumDeckCards: 40,
    pairingPolicy: 'PICK_TWO_FOUR_PLAYER',
  },
  SEALED: {
    mode: 'SEALED',
    hasDraftPhase: false,
    boosterPacksPerPlayer: 6,
    preferredCohortSize: 4,
    minCohortSize: 4,
    maxCohortSize: 4,
    defaultRounds: 'AUTO',
    deckbuildingMinutes: 45,
    roundMinutes: 50,
    supportedMatchStructures: ['BO1', 'BO3'],
    minimumDeckCards: 40,
    pairingPolicy: 'SWISS',
  },
};

export type LimitedTimerStatus = 'RUNNING' | 'PAUSED' | 'EXPIRED';
export type LimitedTimerPhase = 'DRAFTING' | 'DECKBUILDING' | 'ROUND';

export type LimitedTimer = {
  phase: LimitedTimerPhase;
  status: LimitedTimerStatus;
  durationSeconds: number;
  startedAt: string;
  targetAt: string;
  pausedAt?: string;
  remainingSecondsWhenPaused?: number;
};

export type LimitedSessionParticipant = {
  participantId: string;
  displayName: string;
  status: LimitedParticipantStatus;
  joinedAt: string;
  assignedAt?: string;
  draftSeat?: number;
  droppedAt?: string;
};

export type DraftSeat = {
  participantId: string;
  seat: number;
};

export type DraftPod = {
  id: string;
  sessionId: string;
  tableIds: string[];
  seats: DraftSeat[];
};

export type LimitedMatchOutcome =
  | 'PLAYER_A_WIN'
  | 'PLAYER_B_WIN'
  | 'DRAW'
  | 'DOUBLE_LOSS'
  | 'BYE';

export type LimitedMatchStatus = 'PENDING' | 'PLAYING' | 'COMPLETED';

export type LimitedMatch = {
  id: string;
  roundNumber: number;
  position: number;
  playerAId: string;
  playerBId?: string;
  tableId?: string;
  tableLabel?: string;
  status: LimitedMatchStatus;
  bestOf: SeriesLength;
  outcome?: LimitedMatchOutcome;
  playerAGameWins?: number;
  playerBGameWins?: number;
  reportedAt?: string;
};

export type LimitedRound = {
  id: string;
  number: number;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  matches: LimitedMatch[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type LimitedStanding = {
  rank: number;
  participantId: string;
  displayName: string;
  matchWins: number;
  matchLosses: number;
  draws: number;
  byes: number;
  matchesPlayed: number;
  points: number;
  matchWinPercentage: number;
  opponentMatchWinPercentage: number;
};

export type PublicLimitedSession = {
  id: string;
  mode: LimitedMode;
  status: LimitedSessionStatus;
  label: string;
  participants: LimitedSessionParticipant[];
  rounds: LimitedRound[];
  standings: LimitedStanding[];
  matchStructure: LimitedMatchStructure;
  pairingPolicy: LimitedPairingPolicy;
  preferredCohortSize?: number;
  minCohortSize: number;
  maxCohortSize?: number;
  allowUndersizedLaunch: boolean;
  currentRound?: number;
  totalRounds: number;
  draftTableIds: string[];
  draftPod?: DraftPod;
  timer?: LimitedTimer;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type LimitedQueueSummary = {
  mode: LimitedMode;
  participantIds: string[];
  waitingCount: number;
  preferredCohortSize?: number;
  oldestReadyAt?: string;
};

export function isLimitedMode(value: unknown): value is LimitedMode {
  return (
    typeof value === 'string' &&
    (LIMITED_MODES as readonly string[]).includes(value)
  );
}

export function limitedModeConfig(mode: LimitedMode): LimitedModeConfig {
  return LIMITED_MODE_CONFIGS[mode];
}

export function defaultLimitedEventModeConfig(
  mode: LimitedMode,
): LimitedEventModeConfig {
  const config = limitedModeConfig(mode);
  return {
    mode,
    enabled: true,
    matchStructure: 'BO3',
    preferredCohortSize: config.preferredCohortSize,
    minCohortSize: config.minCohortSize,
    maxCohortSize: config.maxCohortSize,
    allowUndersizedLaunch: false,
    totalRounds: config.defaultRounds,
    draftMinutes: config.draftMinutes,
    deckbuildingMinutes: config.deckbuildingMinutes,
    roundMinutes: config.roundMinutes,
  };
}

export function defaultLimitedRounds(participantCount: number): number {
  if (!Number.isInteger(participantCount) || participantCount < 2) {
    throw new Error('Limited sessions need at least two participants.');
  }
  return Math.max(1, Math.ceil(Math.log2(participantCount)));
}

export function validateLimitedCohortSize(
  mode: LimitedMode,
  participantCount: number,
  options: {
    allowUndersizedLaunch?: boolean;
    preferredCohortSize?: number;
    minCohortSize?: number;
    maxCohortSize?: number;
  } = {},
): void {
  const config = limitedModeConfig(mode);
  const minimum = Math.max(
    config.minCohortSize,
    options.minCohortSize ?? config.minCohortSize,
  );
  const configuredMaximum = options.maxCohortSize ?? config.maxCohortSize;
  const maximum =
    config.maxCohortSize === undefined
      ? configuredMaximum
      : configuredMaximum === undefined
        ? config.maxCohortSize
        : Math.min(config.maxCohortSize, configuredMaximum);
  const preferred =
    options.preferredCohortSize ?? config.preferredCohortSize;
  if (!Number.isInteger(participantCount)) {
    throw new Error('Limited cohort size must be an integer.');
  }
  if (participantCount < minimum) {
    throw new Error(
      `${mode} needs at least ${minimum} participants (got ${participantCount}).`,
    );
  }
  if (maximum !== undefined && participantCount > maximum) {
    throw new Error(
      `${mode} supports at most ${maximum} participants (got ${participantCount}).`,
    );
  }
  if (
    preferred !== undefined &&
    participantCount < preferred &&
    options.allowUndersizedLaunch !== true
  ) {
    throw new Error(
      `${mode} waits for its target cohort of ${preferred}; the host must explicitly approve an undersized launch.`,
    );
  }
}

export function deterministicDraftSeats(
  participantIds: readonly string[],
): ReadonlyArray<{ participantId: string; seat: number }> {
  assertUniqueIds(participantIds);
  return participantIds.map((participantId, index) => ({
    participantId,
    seat: index + 1,
  }));
}

export function draftPackDirection(packNumber: 1 | 2 | 3): 'LEFT' | 'RIGHT' {
  return packNumber === 2 ? 'RIGHT' : 'LEFT';
}

export type LimitedPairingParticipant = {
  participantId: string;
  displayName?: string;
  dropped?: boolean;
};

export type LimitedPairingInput = {
  sessionId: string;
  mode: LimitedMode;
  roundNumber: number;
  participants: readonly LimitedPairingParticipant[];
  previousMatches: readonly LimitedMatch[];
  bestOf: SeriesLength;
};

export function pairLimitedRound(input: LimitedPairingInput): LimitedRound {
  if (!Number.isInteger(input.roundNumber) || input.roundNumber < 1) {
    throw new Error('Limited round number must be a positive integer.');
  }
  if (input.bestOf !== 1 && input.bestOf !== 3) {
    throw new Error('Limited matches support best-of-one or best-of-three.');
  }
  const activeIds = input.participants
    .filter((participant) => !participant.dropped)
    .map((participant) => participant.participantId);
  assertUniqueIds(activeIds);
  if (activeIds.length < 2) {
    throw new Error('A Limited round needs at least two active participants.');
  }
  if (
    input.mode === 'PICK_TWO_DRAFT' &&
    activeIds.length === 4 &&
    input.roundNumber === 1
  ) {
    return makeRound(input, [
      [activeIds[0]!, activeIds[1]!],
      [activeIds[2]!, activeIds[3]!],
    ]);
  }
  if (
    input.mode === 'PICK_TWO_DRAFT' &&
    activeIds.length === 4 &&
    input.roundNumber === 2
  ) {
    const special = pickTwoSecondRound(activeIds, input.previousMatches);
    if (special) return makeRound(input, special);
  }

  const standings = calculateLimitedStandings(
    input.participants.map((participant) => ({
      participantId: participant.participantId,
      displayName:
        participant.displayName ?? participant.participantId,
      dropped: participant.dropped,
    })),
    input.previousMatches,
  );
  const ranked = standings
    .filter((standing) => activeIds.includes(standing.participantId))
    .map((standing) => standing.participantId);
  const byeId = ranked.length % 2 === 1
    ? chooseBye(ranked, standings, input.previousMatches)
    : undefined;
  const pairedIds = ranked.filter((id) => id !== byeId);
  const pairs = optimalPairs(pairedIds, standings, input.previousMatches);
  if (byeId) pairs.push([byeId]);
  return makeRound(input, pairs);
}

function pickTwoSecondRound(
  activeIds: readonly string[],
  previousMatches: readonly LimitedMatch[],
): string[][] | undefined {
  const firstRound = previousMatches
    .filter((match) => match.roundNumber === 1 && match.playerBId)
    .sort((left, right) => left.position - right.position);
  if (firstRound.length !== 2 || firstRound.some((match) => !match.outcome)) {
    return undefined;
  }
  const winners: string[] = [];
  const nonWinners: string[] = [];
  for (const match of firstRound) {
    const playerBId = match.playerBId!;
    if (match.outcome === 'PLAYER_A_WIN') {
      winners.push(match.playerAId);
      nonWinners.push(playerBId);
    } else if (match.outcome === 'PLAYER_B_WIN') {
      winners.push(playerBId);
      nonWinners.push(match.playerAId);
    } else {
      return undefined;
    }
  }
  if (
    winners.length !== 2 ||
    nonWinners.length !== 2 ||
    [...winners, ...nonWinners].some((id) => !activeIds.includes(id))
  ) {
    return undefined;
  }
  return [winners, nonWinners];
}

function chooseBye(
  ranked: readonly string[],
  standings: readonly LimitedStanding[],
  matches: readonly LimitedMatch[],
): string {
  const byeCounts = new Map(
    standings.map((standing) => [standing.participantId, standing.byes]),
  );
  const minimumByes = Math.min(...ranked.map((id) => byeCounts.get(id) ?? 0));
  const candidates = ranked.filter(
    (id) => (byeCounts.get(id) ?? 0) === minimumByes,
  );
  // Lowest-ranked eligible participant receives the bye. Stable id ordering
  // makes a tied field deterministic.
  const rankIndex = new Map(ranked.map((id, index) => [id, index]));
  return [...candidates].sort(
    (left, right) =>
      (rankIndex.get(right) ?? 0) - (rankIndex.get(left) ?? 0) ||
      right.localeCompare(left),
  )[0]!;
}

type PairingCost = {
  rematches: number;
  pointsGap: number;
  rankGap: number;
  key: string;
};

function optimalPairs(
  rankedIds: readonly string[],
  standings: readonly LimitedStanding[],
  previousMatches: readonly LimitedMatch[],
): string[][] {
  if (rankedIds.length % 2 !== 0) {
    throw new Error('Pairing requires an even number of participants.');
  }
  const previous = new Set(
    previousMatches
      .filter((match) => match.playerBId)
      .map((match) => pairKey(match.playerAId, match.playerBId!)),
  );
  const byId = new Map(
    standings.map((standing, index) => [
      standing.participantId,
      { standing, rank: index },
    ]),
  );
  const memo = new Map<string, { pairs: string[][]; cost: PairingCost }>();

  function solve(ids: readonly string[]): {
    pairs: string[][];
    cost: PairingCost;
  } {
    if (ids.length === 0) {
      return {
        pairs: [],
        cost: { rematches: 0, pointsGap: 0, rankGap: 0, key: '' },
      };
    }
    const memoKey = [...ids].sort().join('|');
    const cached = memo.get(memoKey);
    if (cached) return cached;
    const first = ids[0]!;
    let best:
      | { pairs: string[][]; cost: PairingCost }
      | undefined;
    for (let index = 1; index < ids.length; index += 1) {
      const second = ids[index]!;
      const rest = ids.filter((_, restIndex) => restIndex !== 0 && restIndex !== index);
      const tail = solve(rest);
      const firstRecord = byId.get(first)!;
      const secondRecord = byId.get(second)!;
      const key = pairKey(first, second);
      const cost: PairingCost = {
        rematches: tail.cost.rematches + (previous.has(key) ? 1 : 0),
        pointsGap:
          tail.cost.pointsGap +
          Math.abs(
            firstRecord.standing.points - secondRecord.standing.points,
          ),
        rankGap:
          tail.cost.rankGap +
          Math.abs(firstRecord.rank - secondRecord.rank),
        key: [key, tail.cost.key].filter(Boolean).sort().join(';'),
      };
      const candidate = { pairs: [[first, second], ...tail.pairs], cost };
      if (!best || comparePairingCost(cost, best.cost) < 0) best = candidate;
    }
    if (!best) throw new Error('Failed to produce Limited pairings.');
    memo.set(memoKey, best);
    return best;
  }

  return solve(rankedIds).pairs;
}

function comparePairingCost(left: PairingCost, right: PairingCost): number {
  return (
    left.rematches - right.rematches ||
    left.pointsGap - right.pointsGap ||
    left.rankGap - right.rankGap ||
    left.key.localeCompare(right.key)
  );
}

function makeRound(
  input: LimitedPairingInput,
  groups: readonly (readonly string[])[],
): LimitedRound {
  const now = new Date(0).toISOString();
  return {
    id: `${input.sessionId}:round:${input.roundNumber}`,
    number: input.roundNumber,
    status: 'PENDING',
    createdAt: now,
    matches: groups.map((ids, position) => {
      const playerAId = ids[0]!;
      const playerBId = ids[1];
      return {
        id: `${input.sessionId}:round:${input.roundNumber}:match:${position + 1}`,
        roundNumber: input.roundNumber,
        position: position + 1,
        playerAId,
        ...(playerBId ? { playerBId } : {}),
        status: playerBId ? 'PENDING' : 'COMPLETED',
        bestOf: input.bestOf,
        ...(!playerBId
          ? {
              outcome: 'BYE' as const,
              reportedAt: now,
              playerAGameWins: 1,
              playerBGameWins: 0,
            }
          : {}),
      };
    }),
  };
}

export type LimitedStandingParticipant = {
  participantId: string;
  displayName: string;
  dropped?: boolean;
};

export function calculateLimitedStandings(
  participants: readonly LimitedStandingParticipant[],
  matches: readonly LimitedMatch[],
): LimitedStanding[] {
  assertUniqueIds(participants.map((participant) => participant.participantId));
  const records = new Map<
    string,
    Omit<
      LimitedStanding,
      'rank' | 'matchWinPercentage' | 'opponentMatchWinPercentage'
    >
  >();
  const opponents = new Map<string, string[]>();
  for (const participant of participants) {
    records.set(participant.participantId, {
      participantId: participant.participantId,
      displayName: participant.displayName,
      matchWins: 0,
      matchLosses: 0,
      draws: 0,
      byes: 0,
      matchesPlayed: 0,
      points: 0,
    });
    opponents.set(participant.participantId, []);
  }
  for (const match of matches) {
    if (match.status !== 'COMPLETED' || !match.outcome) continue;
    const a = records.get(match.playerAId);
    if (!a) continue;
    if (match.outcome === 'BYE') {
      a.matchWins += 1;
      a.byes += 1;
      a.matchesPlayed += 1;
      a.points += 3;
      continue;
    }
    const playerBId = match.playerBId;
    const b = playerBId ? records.get(playerBId) : undefined;
    if (!playerBId || !b) continue;
    a.matchesPlayed += 1;
    b.matchesPlayed += 1;
    opponents.get(a.participantId)?.push(b.participantId);
    opponents.get(b.participantId)?.push(a.participantId);
    if (match.outcome === 'PLAYER_A_WIN') {
      a.matchWins += 1;
      b.matchLosses += 1;
      a.points += 3;
    } else if (match.outcome === 'PLAYER_B_WIN') {
      b.matchWins += 1;
      a.matchLosses += 1;
      b.points += 3;
    } else if (match.outcome === 'DRAW') {
      a.draws += 1;
      b.draws += 1;
      a.points += 1;
      b.points += 1;
    } else if (match.outcome === 'DOUBLE_LOSS') {
      a.matchLosses += 1;
      b.matchLosses += 1;
    }
  }

  const matchWinPercentage = (id: string): number => {
    const record = records.get(id);
    if (!record || record.matchesPlayed === 0) return 0;
    return record.points / (record.matchesPlayed * 3);
  };
  const withOpponents = [...records.values()].map((record) => {
    const opponentIds = opponents.get(record.participantId) ?? [];
    const opponentMatchWinPercentage =
      opponentIds.length === 0
        ? 0
        : opponentIds.reduce(
            (sum, opponentId) => sum + matchWinPercentage(opponentId),
            0,
          ) / opponentIds.length;
    return {
      ...record,
      matchWinPercentage: matchWinPercentage(record.participantId),
      opponentMatchWinPercentage,
    };
  });
  return withOpponents
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.matchWinPercentage - left.matchWinPercentage ||
        right.opponentMatchWinPercentage -
          left.opponentMatchWinPercentage ||
        left.participantId.localeCompare(right.participantId),
    )
    .map((standing, index) => ({ ...standing, rank: index + 1 }));
}

export function startLimitedTimer(
  phase: LimitedTimerPhase,
  durationSeconds: number,
  now: string,
): LimitedTimer {
  const at = parseTime(now);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1) {
    throw new Error('Limited timer duration must be a positive integer.');
  }
  return {
    phase,
    status: 'RUNNING',
    durationSeconds,
    startedAt: at.toISOString(),
    targetAt: new Date(at.getTime() + durationSeconds * 1000).toISOString(),
  };
}

export function limitedTimerRemainingSeconds(
  timer: LimitedTimer,
  now: string,
): number {
  if (timer.status === 'PAUSED') {
    return Math.max(0, timer.remainingSecondsWhenPaused ?? 0);
  }
  return Math.max(
    0,
    Math.ceil((parseTime(timer.targetAt).getTime() - parseTime(now).getTime()) / 1000),
  );
}

export function pauseLimitedTimer(
  timer: LimitedTimer,
  now: string,
): LimitedTimer {
  if (timer.status !== 'RUNNING') {
    throw new Error('Only a running Limited timer can be paused.');
  }
  const remaining = limitedTimerRemainingSeconds(timer, now);
  return {
    ...timer,
    status: remaining === 0 ? 'EXPIRED' : 'PAUSED',
    pausedAt: parseTime(now).toISOString(),
    remainingSecondsWhenPaused: remaining,
  };
}

export function resumeLimitedTimer(
  timer: LimitedTimer,
  now: string,
): LimitedTimer {
  if (timer.status !== 'PAUSED') {
    throw new Error('Only a paused Limited timer can be resumed.');
  }
  return startLimitedTimer(
    timer.phase,
    Math.max(1, timer.remainingSecondsWhenPaused ?? 0),
    now,
  );
}

export function addLimitedTimerSeconds(
  timer: LimitedTimer,
  seconds: number,
): LimitedTimer {
  if (!Number.isInteger(seconds) || seconds === 0) {
    throw new Error('Timer adjustment must be a non-zero integer.');
  }
  if (timer.status === 'PAUSED') {
    const remaining = (timer.remainingSecondsWhenPaused ?? 0) + seconds;
    if (remaining < 1) throw new Error('Timer adjustment cannot make time negative.');
    return { ...timer, remainingSecondsWhenPaused: remaining };
  }
  const targetAt = parseTime(timer.targetAt);
  const adjusted = new Date(targetAt.getTime() + seconds * 1000);
  if (adjusted <= parseTime(timer.startedAt)) {
    throw new Error('Timer adjustment cannot end before it started.');
  }
  return { ...timer, targetAt: adjusted.toISOString() };
}

export function assertLimitedRoundInvariant(round: LimitedRound): void {
  const seen = new Set<string>();
  for (const match of round.matches) {
    if (match.roundNumber !== round.number) {
      throw new Error('Limited match belongs to the wrong round.');
    }
    if (match.playerBId === match.playerAId) {
      throw new Error('Limited participant cannot play themselves.');
    }
    for (const id of [match.playerAId, match.playerBId].filter(
      (value): value is string => Boolean(value),
    )) {
      if (seen.has(id)) {
        throw new Error('Limited participant appears more than once in a round.');
      }
      seen.add(id);
    }
    if (!match.playerBId && match.outcome !== 'BYE') {
      throw new Error('A one-player Limited match must be a bye.');
    }
  }
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function assertUniqueIds(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Limited participant ids must be non-empty strings.');
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate Limited participant id: ${id}.`);
    }
    seen.add(id);
  }
}

function parseTime(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp: ${value}.`);
  }
  return parsed;
}
