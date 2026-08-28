export type TournamentFormat = 'single-elimination' | 'swiss';
export type TournamentPhase = 'registration' | 'in-progress' | 'completed';
export type TournamentMatchStatus = 'pending' | 'formed' | 'playing' | 'completed';
export type SeriesLength = 1 | 3 | 5;

export type TournamentOptions = {
  /** Players seated per match. Use 2 for a classic bracket tree. */
  matchSize?: number;
  /** Default series length for opening / Swiss rounds. */
  defaultBestOf?: SeriesLength;
  /** Single-elim final-round series length. Defaults to defaultBestOf. */
  finalBestOf?: SeriesLength;
  /** Swiss round count. Defaults to ceil(log2(entrants)) when starting. */
  swissRounds?: number;
};

export type TournamentMatch = {
  id: string;
  round: number;
  position: number;
  participantIds: string[];
  status: TournamentMatchStatus;
  bestOf: SeriesLength;
  /** Wins tallied toward the series (BO1/BO3/BO5). */
  seriesWins: Record<string, number>;
  podId?: string;
  tableId?: string;
  winnerParticipantId?: string;
};

export type TournamentRound = {
  number: number;
  matches: TournamentMatch[];
};

export type TournamentRecord = {
  wins: number;
  losses: number;
};

export type TournamentState = {
  format: TournamentFormat;
  phase: TournamentPhase;
  podSize: number;
  defaultBestOf: SeriesLength;
  finalBestOf: SeriesLength;
  swissRounds?: number;
  entrantIds: string[];
  rounds: TournamentRound[];
  /** Swiss win/loss table keyed by participant id. */
  records: Record<string, TournamentRecord>;
  championParticipantId?: string;
  startedAt?: string;
  completedAt?: string;
};

export function createTournamentState(
  format: TournamentFormat,
  podSize: number,
  options: TournamentOptions = {},
): TournamentState {
  assertFormat(format);
  const matchSize = options.matchSize ?? podSize;
  assertPodSize(matchSize);
  const defaultBestOf = assertSeriesLength(options.defaultBestOf ?? 1);
  const finalBestOf = assertSeriesLength(options.finalBestOf ?? defaultBestOf);
  if (
    options.swissRounds !== undefined &&
    (!Number.isInteger(options.swissRounds) || options.swissRounds < 1)
  ) {
    throw new Error('swissRounds must be a positive integer.');
  }
  return {
    format,
    phase: 'registration',
    podSize: matchSize,
    defaultBestOf,
    finalBestOf,
    ...(format === 'swiss' && options.swissRounds !== undefined
      ? { swissRounds: options.swissRounds }
      : {}),
    entrantIds: [],
    rounds: [],
    records: {},
  };
}

export function startTournament(
  state: TournamentState,
  entrantIds: string[],
  now?: string,
): TournamentState {
  if (state.format === 'swiss') {
    return startSwiss(state, entrantIds, now);
  }
  return startSingleElimination(state, entrantIds, now);
}

export function startSingleElimination(
  state: TournamentState,
  entrantIds: string[],
  now?: string,
): TournamentState {
  assertFormat(state.format);
  if (state.format !== 'single-elimination') {
    throw new Error('startSingleElimination requires single-elimination format.');
  }
  assertPodSize(state.podSize);
  if (state.phase !== 'registration') {
    throw new Error('Tournament can only be started from registration.');
  }
  const unique = uniqueEntrants(entrantIds);
  const round = buildEliminationRound(1, unique, state.podSize, state.defaultBestOf);
  return {
    ...cloneState(state),
    phase: 'in-progress',
    entrantIds: unique,
    rounds: [round],
    records: Object.fromEntries(
      unique.map((id) => [id, { wins: 0, losses: 0 }]),
    ),
    startedAt: timestamp(now),
  };
}

export function startSwiss(
  state: TournamentState,
  entrantIds: string[],
  now?: string,
): TournamentState {
  assertFormat(state.format);
  if (state.format !== 'swiss') {
    throw new Error('startSwiss requires swiss format.');
  }
  assertPodSize(state.podSize);
  if (state.phase !== 'registration') {
    throw new Error('Tournament can only be started from registration.');
  }
  const unique = uniqueEntrants(entrantIds);
  if (unique.length % state.podSize !== 0) {
    throw new Error(
      `Swiss needs a multiple of ${state.podSize} entrants (got ${unique.length}).`,
    );
  }
  const swissRounds =
    state.swissRounds ??
    Math.max(1, Math.ceil(Math.log2(Math.max(unique.length, 2))));
  const round = buildSwissRound(1, unique, state.podSize, state.defaultBestOf, {});
  return {
    ...cloneState(state),
    phase: 'in-progress',
    swissRounds,
    entrantIds: unique,
    rounds: [round],
    records: Object.fromEntries(
      unique.map((id) => [id, { wins: 0, losses: 0 }]),
    ),
    startedAt: timestamp(now),
  };
}

export function setTournamentMatchBestOf(
  state: TournamentState,
  matchId: string,
  bestOf: SeriesLength,
): TournamentState {
  assertSeriesLength(bestOf);
  const next = cloneState(state);
  const match = requireMatch(next, matchId);
  if (match.status !== 'pending') {
    throw new Error('Only pending matches can change series length.');
  }
  if (Object.values(match.seriesWins ?? {}).some((wins) => wins > 0)) {
    throw new Error('Cannot change series length after games have been played.');
  }
  match.bestOf = bestOf;
  match.seriesWins ??= Object.fromEntries(
    match.participantIds.map((id) => [id, 0]),
  );
  return next;
}

export function markTournamentMatchFormed(
  state: TournamentState,
  matchId: string,
  podId: string,
  tableId: string,
): TournamentState {
  const next = cloneState(state);
  const match = requireMatch(next, matchId);
  if (match.status !== 'pending') {
    throw new Error(
      `Match ${matchId} must be pending to form (was ${match.status}).`,
    );
  }
  match.status = 'formed';
  match.podId = podId;
  match.tableId = tableId;
  return next;
}

export function markTournamentMatchPlaying(
  state: TournamentState,
  matchId: string,
): TournamentState {
  const next = cloneState(state);
  const match = requireMatch(next, matchId);
  if (match.status !== 'formed') {
    throw new Error(
      `Match ${matchId} must be formed to start playing (was ${match.status}).`,
    );
  }
  match.status = 'playing';
  return next;
}

/**
 * Records one game win inside a series (BO1/BO3/BO5).
 * Returns whether the series (and thus the bracket match) is finished.
 */
export function completeTournamentMatch(
  state: TournamentState,
  matchId: string,
  winnerId: string,
  now?: string,
): TournamentState {
  const result = recordTournamentGame(state, matchId, winnerId, now);
  return result.state;
}

export function recordTournamentGame(
  state: TournamentState,
  matchId: string,
  winnerId: string,
  now?: string,
): { state: TournamentState; seriesComplete: boolean } {
  if (state.phase !== 'in-progress') {
    throw new Error('Matches can only be completed while the tournament is in progress.');
  }
  const next = cloneState(state);
  const match = requireMatch(next, matchId);
  if (match.status !== 'formed' && match.status !== 'playing') {
    throw new Error(
      `Match ${matchId} must be formed or playing to complete (was ${match.status}).`,
    );
  }
  if (!match.participantIds.includes(winnerId)) {
    throw new Error(
      `Winner ${winnerId} is not a participant of match ${matchId}.`,
    );
  }

  match.seriesWins ??= Object.fromEntries(
    match.participantIds.map((id) => [id, 0]),
  );
  match.bestOf = coerceSeriesLength(match.bestOf, 1);
  match.seriesWins[winnerId] = (match.seriesWins[winnerId] ?? 0) + 1;
  const winsNeeded = seriesWinsNeeded(match.bestOf);
  if ((match.seriesWins[winnerId] ?? 0) < winsNeeded) {
    // Series continues: free the table so the next game can be seated.
    match.status = 'pending';
    delete match.podId;
    delete match.tableId;
    return { state: next, seriesComplete: false };
  }

  match.status = 'completed';
  match.winnerParticipantId = winnerId;
  delete match.podId;
  delete match.tableId;

  for (const participantId of match.participantIds) {
    const record = next.records[participantId] ?? { wins: 0, losses: 0 };
    if (participantId === winnerId) {
      record.wins += 1;
    } else {
      record.losses += 1;
    }
    next.records[participantId] = record;
  }

  if (next.format === 'swiss') {
    return { state: advanceSwiss(next, now), seriesComplete: true };
  }
  return { state: advanceElimination(next, now), seriesComplete: true };
}

export function cancelTournamentMatch(
  state: TournamentState,
  matchId: string,
): TournamentState {
  const next = cloneState(state);
  const match = requireMatch(next, matchId);
  if (match.status !== 'formed' && match.status !== 'playing') {
    throw new Error(
      `Match ${matchId} must be formed or playing to cancel (was ${match.status}).`,
    );
  }
  match.status = 'pending';
  delete match.podId;
  delete match.tableId;
  return next;
}

export function currentTournamentRound(
  state: TournamentState,
): TournamentRound | undefined {
  return state.rounds[state.rounds.length - 1];
}

export function tournamentMatchByPod(
  state: TournamentState,
  podId: string,
): TournamentMatch | undefined {
  for (const round of state.rounds) {
    const match = round.matches.find((row) => row.podId === podId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function seriesWinsNeeded(bestOf: SeriesLength): number {
  return Math.ceil(bestOf / 2);
}

/** Backfill fields added after the first tournament JSON shape. */
export function normalizeTournamentState(raw: TournamentState): TournamentState {
  const defaultBestOf = coerceSeriesLength(
    (raw as { defaultBestOf?: number }).defaultBestOf,
    1,
  );
  const finalBestOf = coerceSeriesLength(
    (raw as { finalBestOf?: number }).finalBestOf,
    defaultBestOf,
  );
  const records =
    raw.records && typeof raw.records === 'object' ? raw.records : {};
  return {
    ...raw,
    format:
      raw.format === 'swiss' || raw.format === 'single-elimination'
        ? raw.format
        : 'single-elimination',
    defaultBestOf,
    finalBestOf,
    records,
    rounds: (raw.rounds ?? []).map((round) => ({
      number: round.number,
      matches: round.matches.map((match) => ({
        ...match,
        bestOf: coerceSeriesLength(
          (match as { bestOf?: number }).bestOf,
          defaultBestOf,
        ),
        seriesWins:
          match.seriesWins && typeof match.seriesWins === 'object'
            ? match.seriesWins
            : Object.fromEntries(
                match.participantIds.map((id) => [
                  id,
                  match.winnerParticipantId === id ? 1 : 0,
                ]),
              ),
      })),
    })),
  };
}

function coerceSeriesLength(
  value: number | undefined,
  fallback: SeriesLength,
): SeriesLength {
  if (value === 1 || value === 3 || value === 5) {
    return value;
  }
  return fallback;
}

function advanceElimination(
  state: TournamentState,
  now?: string,
): TournamentState {
  const current = state.rounds[state.rounds.length - 1];
  if (!current || !current.matches.every((row) => row.status === 'completed')) {
    return state;
  }

  const winners = [...current.matches]
    .sort((a, b) => a.position - b.position)
    .map((row) => row.winnerParticipantId)
    .filter((id): id is string => Boolean(id));

  if (winners.length === 1) {
    state.phase = 'completed';
    state.championParticipantId = winners[0];
    state.completedAt = timestamp(now);
    return state;
  }

  const nextRoundNumber = current.number + 1;
  const remainingRoundsEstimate = estimateEliminationRounds(
    winners.length,
    state.podSize,
  );
  const isFinal = remainingRoundsEstimate <= 1;
  const bestOf = isFinal ? state.finalBestOf : state.defaultBestOf;
  state.rounds.push(
    buildEliminationRound(nextRoundNumber, winners, state.podSize, bestOf),
  );
  return state;
}

function advanceSwiss(state: TournamentState, now?: string): TournamentState {
  const current = state.rounds[state.rounds.length - 1];
  if (!current || !current.matches.every((row) => row.status === 'completed')) {
    return state;
  }

  const planned = state.swissRounds ?? current.number;
  if (current.number >= planned) {
    state.phase = 'completed';
    state.championParticipantId = swissLeader(state);
    state.completedAt = timestamp(now);
    return state;
  }

  state.rounds.push(
    buildSwissRound(
      current.number + 1,
      state.entrantIds,
      state.podSize,
      state.defaultBestOf,
      state.records,
      previousPairKeys(state),
    ),
  );
  return state;
}

function estimateEliminationRounds(
  entrantCount: number,
  podSize: number,
): number {
  let remaining = entrantCount;
  let rounds = 0;
  while (remaining > 1) {
    rounds += 1;
    remaining = Math.ceil(remaining / podSize);
  }
  return rounds;
}

function swissLeader(state: TournamentState): string {
  const ranked = [...state.entrantIds].sort((a, b) => {
    const left = state.records[a] ?? { wins: 0, losses: 0 };
    const right = state.records[b] ?? { wins: 0, losses: 0 };
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }
    return state.entrantIds.indexOf(a) - state.entrantIds.indexOf(b);
  });
  const leader = ranked[0];
  if (!leader) {
    throw new Error('Swiss tournament has no entrants.');
  }
  return leader;
}

function previousPairKeys(state: TournamentState): Set<string> {
  const keys = new Set<string>();
  for (const round of state.rounds) {
    for (const match of round.matches) {
      keys.add(pairKey(match.participantIds));
    }
  }
  return keys;
}

function pairKey(participantIds: readonly string[]): string {
  return [...participantIds].sort().join('|');
}

function assertFormat(format: string): asserts format is TournamentFormat {
  if (format !== 'single-elimination' && format !== 'swiss') {
    throw new Error(`Unsupported tournament format: ${format}.`);
  }
}

function assertPodSize(podSize: number): void {
  if (!Number.isInteger(podSize) || podSize < 2 || podSize > 8) {
    throw new Error('podSize must be an integer from 2 to 8.');
  }
}

function assertSeriesLength(value: number): SeriesLength {
  if (value !== 1 && value !== 3 && value !== 5) {
    throw new Error('bestOf must be 1, 3, or 5.');
  }
  return value;
}

function uniqueEntrants(entrantIds: string[]): string[] {
  if (!Array.isArray(entrantIds) || entrantIds.length < 2) {
    throw new Error('A tournament needs at least 2 unique entrants.');
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of entrantIds) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('Entrant ids must be non-empty strings.');
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate entrant id: ${id}.`);
    }
    seen.add(id);
    ordered.push(id);
  }
  if (ordered.length < 2) {
    throw new Error('A tournament needs at least 2 unique entrants.');
  }
  return ordered;
}

/** Balanced groups via snake seeding so early entrants spread across matches. */
function partitionEntrants(
  entrantIds: readonly string[],
  podSize: number,
): string[][] {
  const n = entrantIds.length;
  const groupCount = Math.ceil(n / podSize);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  for (let index = 0; index < n; index += 1) {
    const row = Math.floor(index / groupCount);
    let column = index % groupCount;
    if (row % 2 === 1) {
      column = groupCount - 1 - column;
    }
    const group = groups[column];
    const participantId = entrantIds[index];
    if (!group || participantId === undefined) {
      throw new Error('Failed to snake-seed tournament groups.');
    }
    group.push(participantId);
  }
  for (const group of groups) {
    if (group.length < 2) {
      throw new Error(
        `Cannot partition ${n} entrants into matches of size 2–${podSize} with every match having at least 2 players.`,
      );
    }
    if (group.length > podSize) {
      throw new Error(
        `Cannot partition ${n} entrants without exceeding pod size ${podSize}.`,
      );
    }
  }
  const sizes = groups.map((group) => group.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) {
    throw new Error('Match sizes must differ by at most one.');
  }
  return groups;
}

function buildEliminationRound(
  roundNumber: number,
  participantIds: readonly string[],
  podSize: number,
  bestOf: SeriesLength,
): TournamentRound {
  const groups = partitionEntrants(participantIds, podSize);
  return {
    number: roundNumber,
    matches: groups.map((ids, position) =>
      createMatch(roundNumber, position, ids, bestOf),
    ),
  };
}

function buildSwissRound(
  roundNumber: number,
  entrantIds: readonly string[],
  podSize: number,
  bestOf: SeriesLength,
  records: Record<string, TournamentRecord>,
  avoided: Set<string> = new Set(),
): TournamentRound {
  const ranked = [...entrantIds].sort((a, b) => {
    const left = records[a] ?? { wins: 0, losses: 0 };
    const right = records[b] ?? { wins: 0, losses: 0 };
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }
    return entrantIds.indexOf(a) - entrantIds.indexOf(b);
  });

  const groups: string[][] = [];
  const remaining = [...ranked];
  while (remaining.length >= podSize) {
    const seed = remaining.shift();
    if (!seed) {
      break;
    }
    const group = [seed];
    while (group.length < podSize && remaining.length > 0) {
      let pickIndex = 0;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        if (!candidate) {
          continue;
        }
        const trial = [...group, candidate];
        if (trial.length < podSize || !avoided.has(pairKey(trial))) {
          pickIndex = index;
          if (trial.length === podSize && !avoided.has(pairKey(trial))) {
            break;
          }
        }
      }
      const picked = remaining.splice(pickIndex, 1)[0];
      if (picked) {
        group.push(picked);
      }
    }
    if (group.length < 2) {
      throw new Error('Swiss pairing left a singleton group.');
    }
    groups.push(group);
  }
  if (remaining.length > 0) {
    throw new Error(
      `Swiss pairing could not seat ${remaining.length} leftover entrant(s).`,
    );
  }

  return {
    number: roundNumber,
    matches: groups.map((ids, position) =>
      createMatch(roundNumber, position, ids, bestOf),
    ),
  };
}

function createMatch(
  roundNumber: number,
  position: number,
  participantIds: readonly string[],
  bestOf: SeriesLength,
): TournamentMatch {
  return {
    id: `round-${roundNumber}-match-${position}`,
    round: roundNumber,
    position,
    participantIds: [...participantIds],
    status: 'pending',
    bestOf,
    seriesWins: Object.fromEntries(participantIds.map((id) => [id, 0])),
  };
}

function timestamp(now?: string): string {
  return now ?? new Date().toISOString();
}

function cloneState(state: TournamentState): TournamentState {
  return {
    ...state,
    entrantIds: [...state.entrantIds],
    records: Object.fromEntries(
      Object.entries(state.records).map(([id, record]) => [
        id,
        { wins: record.wins, losses: record.losses },
      ]),
    ),
    rounds: state.rounds.map((round) => ({
      number: round.number,
      matches: round.matches.map((match) => ({
        ...match,
        participantIds: [...match.participantIds],
        seriesWins: { ...(match.seriesWins ?? {}) },
      })),
    })),
  };
}

function requireMatch(state: TournamentState, matchId: string): TournamentMatch {
  for (const round of state.rounds) {
    const match = round.matches.find((row) => row.id === matchId);
    if (match) {
      return match;
    }
  }
  throw new Error(`Unknown match: ${matchId}.`);
}
