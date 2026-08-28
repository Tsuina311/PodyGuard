export type QueueCycleEndReason = 'matched' | 'paused' | 'left' | 'event-closed';
export type WaitDiagnostic =
  | 'WAITING_FOR_TABLE'
  | 'WAITING_FOR_COMPATIBLE_POOL'
  | 'WAITING_FOR_PLAYERS'
  | 'MATCH_AVAILABLE_BUT_NOT_SELECTED'
  | 'UNKNOWN';

export type MetricQueueCycle = {
  participantId: string;
  cycle: number;
  startedAt: number;
  endedAt: number;
  reason: QueueCycleEndReason;
  diagnostic?: WaitDiagnostic;
};

export type MetricGameSeat = {
  participantId: string;
  preferredPoolId: string;
  acceptedPoolIds: readonly string[];
  assignedPoolId: string;
  preferredPodSize: number;
  flexDelta: number;
  concession: boolean;
  postGameDecision: 'requeue' | 'pause' | 'leave' | 'stay' | 'event-closed';
};

export type MetricGame = {
  id: string;
  tableId: string;
  poolId: string;
  startedAt: number;
  endedAt: number;
  seats: readonly MetricGameSeat[];
};

export type MetricParticipant = {
  id: string;
  arrivedAt: number;
  finalStatus: 'joined' | 'ready' | 'playing' | 'paused' | 'left';
};

export type MetricTablePeriod = {
  tableId: string;
  startedAt: number;
  endedAt: number;
  state: 'free' | 'occupied' | 'disabled';
};

export type SafetyViolation = {
  code: string;
  at: number;
  detail: string;
};

/** Matcher-neutral event record. Production data can be adapted to this shape. */
export type EventMetricRecord = {
  scenarioId: string;
  seed: number;
  strategyId: string;
  suiteVersion: string;
  durationSeconds: number;
  participants: readonly MetricParticipant[];
  queueCycles: readonly MetricQueueCycle[];
  games: readonly MetricGame[];
  tablePeriods: readonly MetricTablePeriod[];
  safetyViolations: readonly SafetyViolation[];
};

export type DistributionMetrics = {
  count: number;
  mean: number;
  median: number;
  p95: number;
  max: number;
  maxToMedianRatio: number;
  overThreshold: Readonly<Record<string, number>>;
  overThresholdRate: Readonly<Record<string, number>>;
};

export type EventMetrics = {
  matchedWaitSeconds: DistributionMetrics;
  abandonedWaitSeconds: DistributionMetrics;
  queueCycles: {
    total: number;
    matched: number;
    paused: number;
    left: number;
    eventClosed: number;
    abandoned: number;
  };
  unmatched: {
    participants: number;
    rate: number;
    openCyclesAtClose: number;
  };
  assignment: {
    seats: number;
    preferredPool: number;
    preferredPoolRate: number;
    secondaryPool: number;
    secondaryPoolRate: number;
    nonPreferredSize: number;
    flexConcessions: number;
  };
  flex: {
    earned: number;
    spent: number;
    net: number;
  };
  opponents: {
    pairEncounters: number;
    repeatPairEncounters: number;
    repeatOpponentRate: number;
    immediateRematchPairs: number;
    immediateRematchRate: number;
    averageUniqueOpponents: number;
  };
  pods: {
    counts: Readonly<Record<string, number>>;
    rates: Readonly<Record<string, number>>;
  };
  tables: {
    occupiedSeconds: number;
    availableSeconds: number;
    disabledSeconds: number;
    utilisation: number;
    maxSimultaneousUsed: number;
  };
  games: {
    completed: number;
    durationSeconds: DistributionMetrics;
    gamesPerAttendee: number;
    participantGameDecisions: number;
    requeues: number;
    requeueRate: number;
  };
  waitsByDiagnostic: Readonly<Record<WaitDiagnostic, number>>;
  safety: {
    passed: boolean;
    violationCount: number;
    byCode: Readonly<Record<string, number>>;
  };
};

const DEFAULT_WAIT_THRESHOLDS = [5 * 60, 10 * 60, 15 * 60, 30 * 60] as const;

export function calculateEventMetrics(
  record: EventMetricRecord,
  thresholds: readonly number[] = DEFAULT_WAIT_THRESHOLDS,
): EventMetrics {
  validateMetricRecord(record);
  const matchedCycles = record.queueCycles.filter((cycle) => cycle.reason === 'matched');
  const waits = matchedCycles.map((cycle) => cycle.endedAt - cycle.startedAt);
  const abandonedCycles = record.queueCycles.filter((cycle) => cycle.reason !== 'matched');
  const abandonedWaits = abandonedCycles.map((cycle) => cycle.endedAt - cycle.startedAt);
  const played = new Set(record.games.flatMap((game) => game.seats.map((seat) => seat.participantId)));
  const seats = record.games.flatMap((game) => game.seats);
  const preferredPool = seats.filter((seat) => seat.assignedPoolId === seat.preferredPoolId).length;
  const secondaryPool = seats.filter(
    (seat) =>
      seat.assignedPoolId !== seat.preferredPoolId &&
      seat.acceptedPoolIds.includes(seat.assignedPoolId),
  ).length;
  const nonPreferredSize = record.games.reduce(
    (sum, game) => sum + game.seats.filter((seat) => game.seats.length !== seat.preferredPodSize).length,
    0,
  );
  const flexEarned = seats.reduce((sum, seat) => sum + Math.max(0, seat.flexDelta), 0);
  const flexSpent = seats.reduce((sum, seat) => sum + Math.max(0, -seat.flexDelta), 0);
  const opponentMetrics = calculateOpponentMetrics(record.games);
  const podCounts: Record<string, number> = {};
  for (const game of record.games) {
    increment(podCounts, String(game.seats.length));
  }
  const podRates = mapValues(podCounts, (count) => divide(count, record.games.length));
  const occupiedSeconds = sumTableState(record.tablePeriods, 'occupied');
  const disabledSeconds = sumTableState(record.tablePeriods, 'disabled');
  const availableSeconds = Math.max(
    0,
    record.durationSeconds * new Set(record.tablePeriods.map((period) => period.tableId)).size -
      disabledSeconds,
  );
  const decisions = seats.filter((seat) => seat.postGameDecision !== 'event-closed');
  const requeues = decisions.filter((seat) => seat.postGameDecision === 'requeue').length;
  const safetyByCode: Record<string, number> = {};
  record.safetyViolations.forEach((violation) => increment(safetyByCode, violation.code));

  const diagnostics: Record<WaitDiagnostic, number> = {
    WAITING_FOR_TABLE: 0,
    WAITING_FOR_COMPATIBLE_POOL: 0,
    WAITING_FOR_PLAYERS: 0,
    MATCH_AVAILABLE_BUT_NOT_SELECTED: 0,
    UNKNOWN: 0,
  };
  record.queueCycles.forEach((cycle) => {
    if (cycle.diagnostic) {
      diagnostics[cycle.diagnostic] += 1;
    }
  });

  return {
    matchedWaitSeconds: distributionMetrics(waits, thresholds),
    abandonedWaitSeconds: distributionMetrics(abandonedWaits, thresholds),
    queueCycles: {
      total: record.queueCycles.length,
      matched: matchedCycles.length,
      paused: countReason(record.queueCycles, 'paused'),
      left: countReason(record.queueCycles, 'left'),
      eventClosed: countReason(record.queueCycles, 'event-closed'),
      abandoned: abandonedCycles.length,
    },
    unmatched: {
      participants: record.participants.length - played.size,
      rate: divide(record.participants.length - played.size, record.participants.length),
      openCyclesAtClose: countReason(record.queueCycles, 'event-closed'),
    },
    assignment: {
      seats: seats.length,
      preferredPool,
      preferredPoolRate: divide(preferredPool, seats.length),
      secondaryPool,
      secondaryPoolRate: divide(secondaryPool, seats.length),
      nonPreferredSize,
      flexConcessions: record.games.reduce(
        (sum, game) =>
          sum +
          game.seats.filter(
            (seat) =>
              seat.concession ||
              seat.assignedPoolId !== seat.preferredPoolId ||
              game.seats.length !== seat.preferredPodSize,
          ).length,
        0,
      ),
    },
    flex: {
      earned: flexEarned,
      spent: flexSpent,
      net: flexEarned - flexSpent,
    },
    opponents: opponentMetrics,
    pods: { counts: podCounts, rates: podRates },
    tables: {
      occupiedSeconds,
      availableSeconds,
      disabledSeconds,
      utilisation: divide(occupiedSeconds, availableSeconds),
      maxSimultaneousUsed: maximumSimultaneousOccupied(record.tablePeriods),
    },
    games: {
      completed: record.games.length,
      durationSeconds: distributionMetrics(
        record.games.map((game) => game.endedAt - game.startedAt),
        [],
      ),
      gamesPerAttendee: divide(seats.length, record.participants.length),
      participantGameDecisions: decisions.length,
      requeues,
      requeueRate: divide(requeues, decisions.length),
    },
    waitsByDiagnostic: diagnostics,
    safety: {
      passed: record.safetyViolations.length === 0,
      violationCount: record.safetyViolations.length,
      byCode: safetyByCode,
    },
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function nearestRankPercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new Error('Percentile must be greater than zero and at most one.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1] ?? 0;
}

export function p95NearestRank(values: readonly number[]): number {
  return nearestRankPercentile(values, 0.95);
}

export const calculateMetrics = calculateEventMetrics;

export function distributionMetrics(
  values: readonly number[],
  thresholds: readonly number[] = DEFAULT_WAIT_THRESHOLDS,
): DistributionMetrics {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = median(sorted);
  const overThreshold: Record<string, number> = {};
  const overThresholdRate: Record<string, number> = {};
  for (const threshold of thresholds) {
    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error(`Invalid wait threshold ${threshold}.`);
    }
    const key = String(threshold);
    const count = sorted.filter((value) => value > threshold).length;
    overThreshold[key] = count;
    overThresholdRate[key] = divide(count, sorted.length);
  }
  const maximum = sorted[sorted.length - 1] ?? 0;
  return {
    count: sorted.length,
    mean: divide(sorted.reduce((sum, value) => sum + value, 0), sorted.length),
    median: middle,
    p95: nearestRankPercentile(sorted, 0.95),
    max: maximum,
    maxToMedianRatio: middle === 0 ? (maximum === 0 ? 0 : Number.POSITIVE_INFINITY) : maximum / middle,
    overThreshold,
    overThresholdRate,
  };
}

function calculateOpponentMetrics(games: readonly MetricGame[]): EventMetrics['opponents'] {
  const pairCounts = new Map<string, number>();
  const uniqueByParticipant = new Map<string, Set<string>>();
  const lastGame = new Map<string, string>();
  let pairEncounters = 0;
  let repeatPairEncounters = 0;
  let immediateRematchPairs = 0;
  const ordered = [...games].sort(
    (left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id),
  );
  for (const game of ordered) {
    const ids = game.seats.map((seat) => seat.participantId);
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const left = ids[leftIndex];
        const right = ids[rightIndex];
        if (!left || !right) {
          continue;
        }
        const key = pairKey(left, right);
        pairEncounters += 1;
        if ((pairCounts.get(key) ?? 0) > 0) {
          repeatPairEncounters += 1;
        }
        if (lastGame.get(left) !== undefined && lastGame.get(left) === lastGame.get(right)) {
          immediateRematchPairs += 1;
        }
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        addOpponent(uniqueByParticipant, left, right);
        addOpponent(uniqueByParticipant, right, left);
      }
    }
    ids.forEach((id) => lastGame.set(id, game.id));
  }
  const uniqueCounts = [...uniqueByParticipant.values()].map((opponents) => opponents.size);
  return {
    pairEncounters,
    repeatPairEncounters,
    repeatOpponentRate: divide(repeatPairEncounters, pairEncounters),
    immediateRematchPairs,
    immediateRematchRate: divide(immediateRematchPairs, pairEncounters),
    averageUniqueOpponents: divide(
      uniqueCounts.reduce((sum, count) => sum + count, 0),
      uniqueCounts.length,
    ),
  };
}

function validateMetricRecord(record: EventMetricRecord): void {
  if (!Number.isSafeInteger(record.durationSeconds) || record.durationSeconds < 0) {
    throw new Error('Metric record duration must be a non-negative integer.');
  }
  for (const cycle of record.queueCycles) {
    if (cycle.endedAt < cycle.startedAt) {
      throw new Error(`Queue cycle ends before it starts for ${cycle.participantId}.`);
    }
  }
  for (const game of record.games) {
    if (game.endedAt < game.startedAt) {
      throw new Error(`Game ${game.id} ends before it starts.`);
    }
  }
}

function addOpponent(index: Map<string, Set<string>>, participant: string, opponent: string): void {
  const values = index.get(participant) ?? new Set<string>();
  values.add(opponent);
  index.set(participant, values);
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function countReason(cycles: readonly MetricQueueCycle[], reason: MetricQueueCycle['reason']): number {
  return cycles.filter((cycle) => cycle.reason === reason).length;
}

function sumTableState(
  periods: readonly MetricTablePeriod[],
  state: MetricTablePeriod['state'],
): number {
  return periods
    .filter((period) => period.state === state)
    .reduce((sum, period) => sum + Math.max(0, period.endedAt - period.startedAt), 0);
}

function maximumSimultaneousOccupied(periods: readonly MetricTablePeriod[]): number {
  const boundaries = periods
    .filter((period) => period.state === 'occupied' && period.endedAt > period.startedAt)
    .flatMap((period) => [
      { at: period.startedAt, delta: 1 },
      { at: period.endedAt, delta: -1 },
    ])
    .sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const boundary of boundaries) {
    active += boundary.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function mapValues(
  values: Readonly<Record<string, number>>,
  mapper: (value: number) => number,
): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, mapper(value)]));
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
