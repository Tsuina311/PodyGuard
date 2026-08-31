import { describe, expect, it } from 'vitest';
import {
  addLimitedTimerSeconds,
  assertLimitedRoundInvariant,
  calculateLimitedStandings,
  deterministicDraftSeats,
  draftPackDirection,
  limitedTimerRemainingSeconds,
  pairLimitedRound,
  pauseLimitedTimer,
  resumeLimitedTimer,
  startLimitedTimer,
  validateLimitedCohortSize,
  type LimitedMatch,
  type LimitedPairingParticipant,
} from './limited';

const people = (
  count: number,
): Array<LimitedPairingParticipant & { displayName: string }> =>
  Array.from({ length: count }, (_, index) => ({
    participantId: `p${index + 1}`,
    displayName: `Player ${index + 1}`,
  }));

function completed(
  id: string,
  roundNumber: number,
  position: number,
  playerAId: string,
  playerBId: string,
  outcome: 'PLAYER_A_WIN' | 'PLAYER_B_WIN' | 'DRAW' | 'DOUBLE_LOSS',
): LimitedMatch {
  return {
    id,
    roundNumber,
    position,
    playerAId,
    playerBId,
    status: 'COMPLETED',
    bestOf: 1,
    outcome,
  };
}

describe('Limited mode configuration and draft seating', () => {
  it('locks each format to a fixed pod size', () => {
    expect(() => validateLimitedCohortSize('BOOSTER_DRAFT', 8)).not.toThrow();
    expect(() => validateLimitedCohortSize('BOOSTER_DRAFT', 7)).toThrow(
      /at least 8/,
    );
    expect(() =>
      validateLimitedCohortSize('BOOSTER_DRAFT', 7, {
        allowUndersizedLaunch: true,
      }),
    ).toThrow(/at least 8/);
    expect(() => validateLimitedCohortSize('PICK_TWO_DRAFT', 4)).not.toThrow();
    expect(() =>
      validateLimitedCohortSize('PICK_TWO_DRAFT', 5, {
        allowUndersizedLaunch: true,
      }),
    ).toThrow(/at most 4/);
    expect(() => validateLimitedCohortSize('SEALED', 4)).not.toThrow();
    expect(() => validateLimitedCohortSize('SEALED', 3)).toThrow(/at least 4/);
  });

  it('assigns stable one-based draft seats', () => {
    expect(deterministicDraftSeats(['c', 'a', 'b'])).toEqual([
      { participantId: 'c', seat: 1 },
      { participantId: 'a', seat: 2 },
      { participantId: 'b', seat: 3 },
    ]);
  });

  it('documents left/right/left pack direction', () => {
    expect([
      draftPackDirection(1),
      draftPackDirection(2),
      draftPackDirection(3),
    ]).toEqual(['LEFT', 'RIGHT', 'LEFT']);
  });
});

describe('Limited pairings', () => {
  it('creates deterministic Booster Draft pairings', () => {
    const input = {
      sessionId: 's1',
      mode: 'BOOSTER_DRAFT' as const,
      roundNumber: 1,
      participants: people(8),
      previousMatches: [],
      bestOf: 3 as const,
    };
    expect(pairLimitedRound(input)).toEqual(pairLimitedRound(input));
    const round = pairLimitedRound(input);
    expect(round.matches).toHaveLength(4);
    expect(() => assertLimitedRoundInvariant(round)).not.toThrow();
  });

  it('uses the official optimized Pick-Two four-player Round 1', () => {
    const round = pairLimitedRound({
      sessionId: 'pick-two',
      mode: 'PICK_TWO_DRAFT',
      roundNumber: 1,
      participants: people(4),
      previousMatches: [],
      bestOf: 1,
    });
    expect(
      round.matches.map((match) => [match.playerAId, match.playerBId]),
    ).toEqual([
      ['p1', 'p2'],
      ['p3', 'p4'],
    ]);
  });

  it('pairs Round-1 winners and non-winners in Pick-Two Round 2', () => {
    const previous = [
      completed('m1', 1, 1, 'p1', 'p2', 'PLAYER_A_WIN'),
      completed('m2', 1, 2, 'p3', 'p4', 'PLAYER_B_WIN'),
    ];
    const round = pairLimitedRound({
      sessionId: 'pick-two',
      mode: 'PICK_TWO_DRAFT',
      roundNumber: 2,
      participants: people(4),
      previousMatches: previous,
      bestOf: 1,
    });
    expect(
      round.matches.map((match) => [match.playerAId, match.playerBId]),
    ).toEqual([
      ['p1', 'p4'],
      ['p2', 'p3'],
    ]);
  });

  it('avoids a rematch whenever an alternative complete pairing exists', () => {
    const previous = [
      completed('m1', 1, 1, 'p1', 'p2', 'PLAYER_A_WIN'),
      completed('m2', 1, 2, 'p3', 'p4', 'PLAYER_A_WIN'),
    ];
    const round = pairLimitedRound({
      sessionId: 'sealed',
      mode: 'SEALED',
      roundNumber: 2,
      participants: people(4),
      previousMatches: previous,
      bestOf: 1,
    });
    const keys = round.matches.map((match) =>
      [match.playerAId, match.playerBId].sort().join('|'),
    );
    expect(keys).not.toContain('p1|p2');
    expect(keys).not.toContain('p3|p4');
  });

  it('assigns exactly one bye for odd fields', () => {
    const round = pairLimitedRound({
      sessionId: 'sealed',
      mode: 'SEALED',
      roundNumber: 1,
      participants: people(5),
      previousMatches: [],
      bestOf: 1,
    });
    expect(round.matches.filter((match) => match.outcome === 'BYE')).toHaveLength(
      1,
    );
    expect(() => assertLimitedRoundInvariant(round)).not.toThrow();
  });

  it('does not repeat a bye while an active participant has none', () => {
    const first = pairLimitedRound({
      sessionId: 'sealed',
      mode: 'SEALED',
      roundNumber: 1,
      participants: people(5),
      previousMatches: [],
      bestOf: 1,
    });
    const previous = first.matches.map((match) =>
      match.outcome === 'BYE'
        ? match
        : {
            ...match,
            status: 'COMPLETED' as const,
            outcome: 'PLAYER_A_WIN' as const,
          },
    );
    const firstBye = first.matches.find((match) => match.outcome === 'BYE')!
      .playerAId;
    const second = pairLimitedRound({
      sessionId: 'sealed',
      mode: 'SEALED',
      roundNumber: 2,
      participants: people(5),
      previousMatches: previous,
      bestOf: 1,
    });
    expect(
      second.matches.find((match) => match.outcome === 'BYE')?.playerAId,
    ).not.toBe(firstBye);
  });

  it('excludes dropped participants from future rounds', () => {
    const participants = people(6).map((participant) =>
      participant.participantId === 'p3'
        ? { ...participant, dropped: true }
        : participant,
    );
    const round = pairLimitedRound({
      sessionId: 'sealed',
      mode: 'SEALED',
      roundNumber: 2,
      participants,
      previousMatches: [],
      bestOf: 1,
    });
    expect(
      round.matches.flatMap((match) => [
        match.playerAId,
        match.playerBId,
      ]),
    ).not.toContain('p3');
  });

  it('preserves pairing invariants across varied fields and histories', () => {
    for (let size = 2; size <= 16; size += 1) {
      const participants = people(size);
      let history: LimitedMatch[] = [];
      for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
        const active = participants.map((participant, index) => ({
          ...participant,
          dropped:
            roundNumber > 2 &&
            size > 4 &&
            (index + roundNumber * 3) % 17 === 0,
        }));
        const round = pairLimitedRound({
          sessionId: `property-${size}`,
          mode: 'SEALED',
          roundNumber,
          participants: active,
          previousMatches: history,
          bestOf: roundNumber % 2 === 0 ? 3 : 1,
        });
        expect(() => assertLimitedRoundInvariant(round)).not.toThrow();
        const expectedPlayers = active.filter((participant) => !participant.dropped);
        expect(
          round.matches.flatMap((match) => [
            match.playerAId,
            ...(match.playerBId ? [match.playerBId] : []),
          ]),
        ).toHaveLength(expectedPlayers.length);
        history = [
          ...history,
          ...round.matches.map((match) =>
            match.outcome === 'BYE'
              ? match
              : {
                  ...match,
                  status: 'COMPLETED' as const,
                  outcome:
                    (roundNumber + match.position) % 5 === 0
                      ? ('DRAW' as const)
                      : ('PLAYER_A_WIN' as const),
                },
          ),
        ];
      }
    }
  });
});

describe('Limited standings and timers', () => {
  it('scores wins, draws, double losses, and byes explainably', () => {
    const matches: LimitedMatch[] = [
      completed('m1', 1, 1, 'p1', 'p2', 'PLAYER_A_WIN'),
      completed('m2', 1, 2, 'p3', 'p4', 'DRAW'),
      completed('m3', 2, 1, 'p1', 'p3', 'DOUBLE_LOSS'),
      {
        id: 'bye',
        roundNumber: 2,
        position: 2,
        playerAId: 'p4',
        status: 'COMPLETED',
        bestOf: 1,
        outcome: 'BYE',
      },
    ];
    const standings = calculateLimitedStandings(people(4), matches);
    expect(standings.find((standing) => standing.participantId === 'p1')).toMatchObject({
      matchWins: 1,
      matchLosses: 1,
      points: 3,
    });
    expect(standings.find((standing) => standing.participantId === 'p3')).toMatchObject({
      draws: 1,
      matchLosses: 1,
      points: 1,
    });
    expect(standings.find((standing) => standing.participantId === 'p4')).toMatchObject({
      draws: 1,
      byes: 1,
      points: 4,
    });
  });

  it('uses match-win percentage before opponent percentage', () => {
    const standings = calculateLimitedStandings(people(4), [
      completed('m1', 1, 1, 'p1', 'p3', 'PLAYER_A_WIN'),
      completed('m2', 2, 1, 'p1', 'p4', 'PLAYER_B_WIN'),
      {
        id: 'bye',
        roundNumber: 1,
        position: 2,
        playerAId: 'p2',
        status: 'COMPLETED',
        bestOf: 1,
        outcome: 'BYE',
      },
    ]);
    const p2 = standings.findIndex(
      (standing) => standing.participantId === 'p2',
    );
    const p1 = standings.findIndex(
      (standing) => standing.participantId === 'p1',
    );
    expect(standings[p2]).toMatchObject({
      participantId: 'p2',
      points: 3,
      matchWinPercentage: 1,
    });
    expect(
      standings.find((standing) => standing.participantId === 'p1'),
    ).toMatchObject({ points: 3, matchWinPercentage: 0.5 });
    expect(p2).toBeLessThan(p1);
  });

  it('keeps countdown state authoritative across pause, resume, and added time', () => {
    const timer = startLimitedTimer(
      'DECKBUILDING',
      600,
      '2026-01-01T00:00:00.000Z',
    );
    expect(
      limitedTimerRemainingSeconds(timer, '2026-01-01T00:02:00.000Z'),
    ).toBe(480);
    const paused = pauseLimitedTimer(
      timer,
      '2026-01-01T00:02:00.000Z',
    );
    expect(
      limitedTimerRemainingSeconds(paused, '2026-01-01T01:00:00.000Z'),
    ).toBe(480);
    const extended = addLimitedTimerSeconds(paused, 60);
    const resumed = resumeLimitedTimer(
      extended,
      '2026-01-01T01:00:00.000Z',
    );
    expect(
      limitedTimerRemainingSeconds(resumed, '2026-01-01T01:00:00.000Z'),
    ).toBe(540);
  });
});
