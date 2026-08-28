import { describe, expect, it } from 'vitest';
import {
  cancelTournamentMatch,
  completeTournamentMatch,
  createTournamentState,
  currentTournamentRound,
  markTournamentMatchFormed,
  markTournamentMatchPlaying,
  recordTournamentGame,
  setTournamentMatchBestOf,
  startSingleElimination,
  startSwiss,
  tournamentMatchByPod,
  type TournamentState,
} from './tournament';

const NOW = '2026-08-28T09:00:00.000Z';
const LATER = '2026-08-28T10:00:00.000Z';

function ids(count: number, prefix = 'p'): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function requireRound(state: TournamentState, index?: number) {
  const round =
    index === undefined
      ? currentTournamentRound(state)
      : state.rounds[index];
  if (!round) {
    throw new Error('Expected a tournament round.');
  }
  return round;
}

function requireMatch(state: TournamentState, roundIndex: number, position: number) {
  const match = requireRound(state, roundIndex).matches[position];
  if (!match) {
    throw new Error('Expected a tournament match.');
  }
  return match;
}

function completeAll(
  state: TournamentState,
  winnersByMatchId: Record<string, string>,
  now = LATER,
): TournamentState {
  let next = state;
  for (const [matchId, winnerId] of Object.entries(winnersByMatchId)) {
    next = completeTournamentMatch(next, matchId, winnerId, now);
  }
  return next;
}

describe('createTournamentState', () => {
  it('opens registration for a valid single-elimination pod size', () => {
    const state = createTournamentState('single-elimination', 4);
    expect(state).toEqual({
      format: 'single-elimination',
      phase: 'registration',
      podSize: 4,
      defaultBestOf: 1,
      finalBestOf: 1,
      entrantIds: [],
      rounds: [],
      records: {},
    });
  });

  it('stores series defaults and swiss round count', () => {
    const state = createTournamentState('swiss', 2, {
      defaultBestOf: 3,
      finalBestOf: 5,
      swissRounds: 3,
    });
    expect(state).toMatchObject({
      format: 'swiss',
      podSize: 2,
      defaultBestOf: 3,
      finalBestOf: 5,
      swissRounds: 3,
    });
  });

  it('rejects a non-integer or out-of-range pod size', () => {
    expect(() => createTournamentState('single-elimination', 1)).toThrow(
      /integer from 2 to 8/,
    );
    expect(() => createTournamentState('single-elimination', 9)).toThrow(
      /integer from 2 to 8/,
    );
    expect(() => createTournamentState('single-elimination', 3.5)).toThrow(
      /integer from 2 to 8/,
    );
  });
});

describe('balanced partition and snake seeding', () => {
  it('partitions 8 into two 4-player matches without shuffling order', () => {
    const started = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(8),
      NOW,
    );
    expect(requireRound(started, 0).matches.map((match) => match.participantIds)).toEqual(
      [
        ['p1', 'p4', 'p5', 'p8'],
        ['p2', 'p3', 'p6', 'p7'],
      ],
    );
  });

  it('partitions 5 into 3+2 so sizes differ by at most one', () => {
    const started = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(5),
      NOW,
    );
    const groups = requireRound(started, 0).matches.map(
      (match) => match.participantIds,
    );
    expect(groups.map((group) => group.length).sort()).toEqual([2, 3]);
    expect(groups).toEqual([
      ['p1', 'p4', 'p5'],
      ['p2', 'p3'],
    ]);
  });

  it('spreads early duel entrants across four first-round matches', () => {
    const started = startSingleElimination(
      createTournamentState('single-elimination', 2),
      ids(8),
      NOW,
    );
    expect(requireRound(started, 0).matches.map((match) => match.participantIds)).toEqual(
      [
        ['p1', 'p8'],
        ['p2', 'p7'],
        ['p3', 'p6'],
        ['p4', 'p5'],
      ],
    );
  });
});

describe('startSingleElimination', () => {
  it('creates round 1 with deterministic match ids and in-progress phase', () => {
    const started = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(8),
      NOW,
    );
    expect(started.phase).toBe('in-progress');
    expect(started.entrantIds).toEqual(ids(8));
    expect(started.startedAt).toBe(NOW);
    const round = currentTournamentRound(started);
    expect(round?.number).toBe(1);
    expect(round?.matches.map((match) => match.id)).toEqual([
      'round-1-match-0',
      'round-1-match-1',
    ]);
    expect(round?.matches.map((match) => match.participantIds)).toEqual([
      ['p1', 'p4', 'p5', 'p8'],
      ['p2', 'p3', 'p6', 'p7'],
    ]);
    expect(round?.matches.every((match) => match.status === 'pending')).toBe(
      true,
    );
  });

  it('does not mutate the registration state or the entrant list', () => {
    const registration = createTournamentState('single-elimination', 4);
    const entrants = ids(5);
    const started = startSingleElimination(registration, entrants, NOW);
    expect(registration.phase).toBe('registration');
    expect(registration.rounds).toEqual([]);
    entrants.push('extra');
    expect(started.entrantIds).toEqual(ids(5));
  });

  it('rejects too few or duplicate entrants', () => {
    const state = createTournamentState('single-elimination', 4);
    expect(() => startSingleElimination(state, ['only'])).toThrow(
      /at least 2 unique/,
    );
    expect(() => startSingleElimination(state, [])).toThrow(/at least 2 unique/);
    expect(() =>
      startSingleElimination(state, ['p1', 'p2', 'p1']),
    ).toThrow(/Duplicate entrant id: p1/);
  });

  it('cannot start twice', () => {
    const started = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(4),
      NOW,
    );
    expect(() => startSingleElimination(started, ids(4), NOW)).toThrow(
      /registration/,
    );
  });
});

describe('match lifecycle', () => {
  it('forms, plays, cancels back to pending, and can reform', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(4),
      NOW,
    );
    const matchId = 'round-1-match-0';
    const formed = markTournamentMatchFormed(state, matchId, 'pod-a', 'table-1');
    expect(requireMatch(formed, 0, 0)).toMatchObject({
      status: 'formed',
      podId: 'pod-a',
      tableId: 'table-1',
    });
    expect(requireMatch(state, 0, 0).status).toBe('pending');
    expect(tournamentMatchByPod(formed, 'pod-a')?.id).toBe(matchId);

    const playing = markTournamentMatchPlaying(formed, matchId);
    expect(requireMatch(playing, 0, 0).status).toBe('playing');

    const cancelled = cancelTournamentMatch(playing, matchId);
    expect(requireMatch(cancelled, 0, 0)).toEqual({
      id: matchId,
      round: 1,
      position: 0,
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      status: 'pending',
      bestOf: 1,
      seriesWins: { p1: 0, p2: 0, p3: 0, p4: 0 },
    });
    expect(tournamentMatchByPod(cancelled, 'pod-a')).toBeUndefined();

    const reformed = markTournamentMatchFormed(
      cancelled,
      matchId,
      'pod-b',
      'table-2',
    );
    expect(requireMatch(reformed, 0, 0)).toMatchObject({
      status: 'formed',
      podId: 'pod-b',
      tableId: 'table-2',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
    });
  });

  it('refuses illegal status transitions', () => {
    const state = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(4),
      NOW,
    );
    const matchId = 'round-1-match-0';
    expect(() => markTournamentMatchPlaying(state, matchId)).toThrow(/formed/);
    expect(() => cancelTournamentMatch(state, matchId)).toThrow(
      /formed or playing/,
    );
    expect(() =>
      completeTournamentMatch(state, matchId, 'p1'),
    ).toThrow(/formed or playing/);
    const formed = markTournamentMatchFormed(state, matchId, 'pod-a', 't1');
    expect(() =>
      markTournamentMatchFormed(formed, matchId, 'pod-b', 't2'),
    ).toThrow(/pending/);
  });
});

describe('round advancement', () => {
  it('does not open the next round until every current match is complete', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(8),
      NOW,
    );
    const first = requireMatch(state, 0, 0);
    const second = requireMatch(state, 0, 1);
    const firstWinner = first.participantIds[0];
    const secondWinner = second.participantIds[0];
    if (!firstWinner || !secondWinner) {
      throw new Error('Expected match participants.');
    }
    state = markTournamentMatchFormed(state, first.id, 'pod-a', 't1');
    state = completeTournamentMatch(state, first.id, firstWinner, LATER);
    expect(state.phase).toBe('in-progress');
    expect(state.rounds).toHaveLength(1);
    expect(currentTournamentRound(state)?.matches).toHaveLength(2);

    state = markTournamentMatchFormed(state, second.id, 'pod-b', 't2');
    state = completeTournamentMatch(state, second.id, secondWinner, LATER);
    expect(state.rounds).toHaveLength(2);
    expect(currentTournamentRound(state)?.number).toBe(2);
    expect(currentTournamentRound(state)?.matches).toEqual([
      expect.objectContaining({
        id: 'round-2-match-0',
        participantIds: [firstWinner, secondWinner],
        status: 'pending',
      }),
    ]);
  });

  it('partitions 8 into two 4-player matches then a 2-player final and names a champion', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(8),
      NOW,
    );
    expect(requireRound(state, 0).matches.map((match) => match.participantIds)).toEqual(
      [
        ['p1', 'p4', 'p5', 'p8'],
        ['p2', 'p3', 'p6', 'p7'],
      ],
    );
    state = markTournamentMatchFormed(state, 'round-1-match-0', 'pod-a', 't1');
    state = markTournamentMatchFormed(state, 'round-1-match-1', 'pod-b', 't2');
    state = completeAll(state, {
      'round-1-match-0': 'p1',
      'round-1-match-1': 'p2',
    });
    expect(state.rounds).toHaveLength(2);
    expect(requireMatch(state, 1, 0).participantIds).toEqual(['p1', 'p2']);
    expect(state.phase).toBe('in-progress');

    state = markTournamentMatchFormed(state, 'round-2-match-0', 'pod-f', 't3');
    state = markTournamentMatchPlaying(state, 'round-2-match-0');
    state = completeTournamentMatch(state, 'round-2-match-0', 'p1', LATER);
    expect(state.phase).toBe('completed');
    expect(state.championParticipantId).toBe('p1');
    expect(state.completedAt).toBe(LATER);
    expect(state.rounds).toHaveLength(2);
  });

  it('runs a duel of 8 through 4 matches, 2 semis, and a final', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 2),
      ids(8),
      NOW,
    );
    expect(requireRound(state, 0).matches).toHaveLength(4);
    expect(requireRound(state, 0).matches.map((match) => match.participantIds)).toEqual(
      [
        ['p1', 'p8'],
        ['p2', 'p7'],
        ['p3', 'p6'],
        ['p4', 'p5'],
      ],
    );
    for (const match of requireRound(state, 0).matches) {
      state = markTournamentMatchFormed(
        state,
        match.id,
        `pod-${match.position}`,
        `t-${match.position}`,
      );
    }
    state = completeAll(state, {
      'round-1-match-0': 'p1',
      'round-1-match-1': 'p2',
      'round-1-match-2': 'p3',
      'round-1-match-3': 'p4',
    });
    expect(state.rounds).toHaveLength(2);
    expect(requireRound(state, 1).matches.map((match) => match.participantIds)).toEqual(
      [
        ['p1', 'p4'],
        ['p2', 'p3'],
      ],
    );

    for (const match of requireRound(state, 1).matches) {
      state = markTournamentMatchFormed(
        state,
        match.id,
        `semi-${match.position}`,
        `st-${match.position}`,
      );
    }
    state = completeAll(state, {
      'round-2-match-0': 'p1',
      'round-2-match-1': 'p2',
    });
    expect(requireMatch(state, 2, 0).participantIds).toEqual(['p1', 'p2']);

    state = markTournamentMatchFormed(state, 'round-3-match-0', 'final', 'tf');
    state = completeTournamentMatch(state, 'round-3-match-0', 'p2', LATER);
    expect(state.phase).toBe('completed');
    expect(state.championParticipantId).toBe('p2');
  });

  it('advances a 5-player field from 3+2 into a two-player final', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(5),
      NOW,
    );
    expect(requireRound(state, 0).matches.map((match) => match.participantIds)).toEqual(
      [
        ['p1', 'p4', 'p5'],
        ['p2', 'p3'],
      ],
    );
    state = markTournamentMatchFormed(state, 'round-1-match-0', 'pod-a', 't1');
    state = markTournamentMatchFormed(state, 'round-1-match-1', 'pod-b', 't2');
    state = completeAll(state, {
      'round-1-match-0': 'p5',
      'round-1-match-1': 'p2',
    });
    expect(requireMatch(state, 1, 0).participantIds).toEqual(['p5', 'p2']);
  });

  it('rejects a winner who is not in the match', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 4),
      ids(4),
      NOW,
    );
    state = markTournamentMatchFormed(state, 'round-1-match-0', 'pod-a', 't1');
    expect(() =>
      completeTournamentMatch(state, 'round-1-match-0', 'outsider'),
    ).toThrow(/not a participant/);
  });

  it('builds a classic 4-player tree of two semis and one final', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 2, {
        defaultBestOf: 1,
        finalBestOf: 3,
      }),
      ids(4),
      NOW,
    );
    expect(requireRound(state, 0).matches).toHaveLength(2);
    expect(requireRound(state, 0).matches.map((match) => match.bestOf)).toEqual([
      1, 1,
    ]);
    for (const match of requireRound(state, 0).matches) {
      state = markTournamentMatchFormed(
        state,
        match.id,
        `pod-${match.position}`,
        `t-${match.position}`,
      );
    }
    state = completeAll(state, {
      'round-1-match-0': 'p1',
      'round-1-match-1': 'p2',
    });
    expect(requireMatch(state, 1, 0)).toMatchObject({
      participantIds: ['p1', 'p2'],
      bestOf: 3,
      status: 'pending',
    });
  });
});

describe('best-of series', () => {
  it('records a win on a legacy match that lacks seriesWins', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 2),
      ids(2),
      NOW,
    );
    state = markTournamentMatchFormed(state, 'round-1-match-0', 'pod-a', 't1');
    const legacy = structuredClone(state);
    delete (legacy.rounds[0]!.matches[0] as { seriesWins?: unknown }).seriesWins;
    const recorded = recordTournamentGame(legacy, 'round-1-match-0', 'p1', LATER);
    expect(recorded.seriesComplete).toBe(true);
    expect(recorded.state.championParticipantId).toBe('p1');
  });

  it('keeps a BO3 match open until one player reaches two wins', () => {
    let state = startSingleElimination(
      createTournamentState('single-elimination', 2, { defaultBestOf: 3 }),
      ids(2),
      NOW,
    );
    const matchId = 'round-1-match-0';
    state = setTournamentMatchBestOf(state, matchId, 3);
    state = markTournamentMatchFormed(state, matchId, 'pod-a', 't1');
    const first = recordTournamentGame(state, matchId, 'p1', LATER);
    expect(first.seriesComplete).toBe(false);
    expect(requireMatch(first.state, 0, 0)).toMatchObject({
      status: 'pending',
      seriesWins: { p1: 1, p2: 0 },
    });
    expect(first.state.phase).toBe('in-progress');
    expect(first.state.championParticipantId).toBeUndefined();

    state = markTournamentMatchFormed(first.state, matchId, 'pod-b', 't2');
    const second = recordTournamentGame(state, matchId, 'p2', LATER);
    expect(second.seriesComplete).toBe(false);
    expect(requireMatch(second.state, 0, 0).seriesWins).toEqual({ p1: 1, p2: 1 });

    state = markTournamentMatchFormed(second.state, matchId, 'pod-c', 't3');
    const third = recordTournamentGame(state, matchId, 'p1', LATER);
    expect(third.seriesComplete).toBe(true);
    expect(third.state.phase).toBe('completed');
    expect(third.state.championParticipantId).toBe('p1');
  });
});

describe('swiss', () => {
  it('runs a 4-player swiss stage and crowns the win leader', () => {
    let state = startSwiss(
      createTournamentState('swiss', 2, { swissRounds: 2, defaultBestOf: 1 }),
      ids(4),
      NOW,
    );
    expect(state.swissRounds).toBe(2);
    expect(requireRound(state, 0).matches).toHaveLength(2);

    for (const match of requireRound(state, 0).matches) {
      state = markTournamentMatchFormed(
        state,
        match.id,
        `pod-${match.position}`,
        `t-${match.position}`,
      );
    }
    const round1 = requireRound(state, 0).matches;
    const w0 = round1[0]?.participantIds[0];
    const w1 = round1[1]?.participantIds[0];
    if (!w0 || !w1) {
      throw new Error('Expected swiss participants.');
    }
    state = completeAll(state, {
      [round1[0]!.id]: w0,
      [round1[1]!.id]: w1,
    });
    expect(state.rounds).toHaveLength(2);
    expect(state.phase).toBe('in-progress');

    for (const match of requireRound(state, 1).matches) {
      state = markTournamentMatchFormed(
        state,
        match.id,
        `pod2-${match.position}`,
        `t2-${match.position}`,
      );
    }
    const round2 = requireRound(state, 1).matches;
    const f0 = round2[0]?.participantIds[0];
    const f1 = round2[1]?.participantIds[0];
    if (!f0 || !f1) {
      throw new Error('Expected swiss final-round participants.');
    }
    state = completeAll(state, {
      [round2[0]!.id]: f0,
      [round2[1]!.id]: f1,
    });
    expect(state.phase).toBe('completed');
    expect(state.championParticipantId).toBeTruthy();
    expect(state.records[state.championParticipantId!]?.wins).toBeGreaterThan(0);
  });
});
