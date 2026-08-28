export type TournamentFormat = 'single-elimination';
export type TournamentPhase = 'registration' | 'in-progress' | 'completed';
export type TournamentMatchStatus = 'pending' | 'formed' | 'playing' | 'completed';

export type TournamentMatch = {
  id: string;
  round: number;
  position: number;
  participantIds: string[];
  status: TournamentMatchStatus;
  podId?: string;
  tableId?: string;
  winnerParticipantId?: string;
};

export type TournamentRound = {
  number: number;
  matches: TournamentMatch[];
};

export type TournamentState = {
  format: TournamentFormat;
  phase: TournamentPhase;
  podSize: number;
  entrantIds: string[];
  rounds: TournamentRound[];
  championParticipantId?: string;
  startedAt?: string;
  completedAt?: string;
};

export function createTournamentState(
  format: TournamentFormat,
  podSize: number,
): TournamentState {
  assertFormat(format);
  assertPodSize(podSize);
  return {
    format,
    phase: 'registration',
    podSize,
    entrantIds: [],
    rounds: [],
  };
}

export function startSingleElimination(
  state: TournamentState,
  entrantIds: string[],
  now?: string,
): TournamentState {
  assertFormat(state.format);
  assertPodSize(state.podSize);
  if (state.phase !== 'registration') {
    throw new Error('Tournament can only be started from registration.');
  }
  const unique = uniqueEntrants(entrantIds);
  const round = buildRound(1, unique, state.podSize);
  return {
    format: state.format,
    phase: 'in-progress',
    podSize: state.podSize,
    entrantIds: unique,
    rounds: [round],
    startedAt: timestamp(now),
  };
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

export function completeTournamentMatch(
  state: TournamentState,
  matchId: string,
  winnerId: string,
  now?: string,
): TournamentState {
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
  match.status = 'completed';
  match.winnerParticipantId = winnerId;

  const current = next.rounds[next.rounds.length - 1];
  if (!current || !current.matches.every((row) => row.status === 'completed')) {
    return next;
  }

  const winners = [...current.matches]
    .sort((a, b) => a.position - b.position)
    .map((row) => row.winnerParticipantId)
    .filter((id): id is string => Boolean(id));

  if (winners.length === 1) {
    next.phase = 'completed';
    next.championParticipantId = winners[0];
    next.completedAt = timestamp(now);
    return next;
  }

  next.rounds.push(buildRound(current.number + 1, winners, next.podSize));
  return next;
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

function assertFormat(format: string): asserts format is TournamentFormat {
  if (format !== 'single-elimination') {
    throw new Error(`Unsupported tournament format: ${format}.`);
  }
}

function assertPodSize(podSize: number): void {
  if (!Number.isInteger(podSize) || podSize < 2 || podSize > 8) {
    throw new Error('podSize must be an integer from 2 to 8.');
  }
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

function buildRound(
  roundNumber: number,
  participantIds: readonly string[],
  podSize: number,
): TournamentRound {
  const groups = partitionEntrants(participantIds, podSize);
  return {
    number: roundNumber,
    matches: groups.map((ids, position) => ({
      id: `round-${roundNumber}-match-${position}`,
      round: roundNumber,
      position,
      participantIds: [...ids],
      status: 'pending' as const,
    })),
  };
}

function timestamp(now?: string): string {
  return now ?? new Date().toISOString();
}

function cloneState(state: TournamentState): TournamentState {
  return {
    ...state,
    entrantIds: [...state.entrantIds],
    rounds: state.rounds.map((round) => ({
      number: round.number,
      matches: round.matches.map((match) => ({
        ...match,
        participantIds: [...match.participantIds],
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
