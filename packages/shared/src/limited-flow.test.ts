import { describe, expect, it } from 'vitest';
import {
  pairLimitedRound,
  pickTwoRoundPairs,
  plannedLimitedRounds,
} from './limited';
import {
  applyLimitedSeatChoice,
  confirmLimitedSeat,
  everyoneSeated,
  limitedDeckbuildingTitle,
  limitedDraftInstructions,
  limitedHostCue,
  limitedPlayerCue,
  recordLimitedPhaseAck,
  type LimitedSeatState,
} from './limited-flow';

const chairs = (ids: string[]): LimitedSeatState[] =>
  ids.map((participantId) => ({
    participantId,
    seat: null,
    seated: false,
  }));

describe('Limited flow copy', () => {
  it('tells a lobby player to ready, and the host how many are ready', () => {
    expect(
      limitedPlayerCue({
        mode: 'PICK_TWO_DRAFT',
        inLobby: true,
        ready: false,
        session: null,
      }),
    ).toMatchObject({
      action: 'ready',
      actionLabel: "I'm ready",
    });
    expect(
      limitedHostCue({
        mode: 'PICK_TWO_DRAFT',
        podSize: 4,
        joined: 4,
        ready: 3,
        deckMinutes: 30,
        roundMinutes: 50,
        draftMinutes: 50,
        session: null,
      }).action,
    ).toBe('none');
    expect(
      limitedHostCue({
        mode: 'PICK_TWO_DRAFT',
        podSize: 4,
        joined: 4,
        ready: 4,
        deckMinutes: 30,
        roundMinutes: 50,
        draftMinutes: 50,
        session: null,
      }),
    ).toMatchObject({
      action: 'assign',
      actionLabel: 'Assign to tables',
    });
  });

  it('walks seating, draft confirmation, and deckbuilding for Pick-Two', () => {
    const seating = limitedPlayerCue({
      mode: 'PICK_TWO_DRAFT',
      inLobby: true,
      ready: true,
      session: {
        status: 'SEATING',
        mode: 'PICK_TWO_DRAFT',
        tableLabel: 'Table 1',
        seat: null,
        seated: false,
        phaseAckCount: 0,
        selfAcked: false,
        opponentName: null,
        roundNumber: null,
        totalRounds: 3,
      },
    });
    expect(seating.title).toBe('You are at Table 1');
    expect(seating.action).toBe('seat');

    const sat = limitedPlayerCue({
      mode: 'PICK_TWO_DRAFT',
      inLobby: true,
      ready: true,
      session: {
        status: 'SEATING',
        mode: 'PICK_TWO_DRAFT',
        tableLabel: 'Table 1',
        seat: 2,
        seated: false,
        phaseAckCount: 0,
        selfAcked: false,
        opponentName: null,
        roundNumber: null,
        totalRounds: 3,
      },
    });
    expect(sat.actionLabel).toBe("I'm seated");

    const first = limitedPlayerCue({
      mode: 'PICK_TWO_DRAFT',
      inLobby: true,
      ready: true,
      session: {
        status: 'DRAFTING',
        mode: 'PICK_TWO_DRAFT',
        tableLabel: 'Table 1',
        seat: 1,
        seated: true,
        phaseAckCount: 0,
        selfAcked: false,
        opponentName: null,
        roundNumber: null,
        totalRounds: 3,
      },
    });
    expect(first.title).toBe(limitedDraftInstructions('PICK_TWO_DRAFT'));
    expect(first.title).toContain('Take two cards');
    expect(first.title).toContain('left, then right, then left');
    expect(first.actionLabel).toBe('We are done drafting');

    const confirm = limitedPlayerCue({
      mode: 'PICK_TWO_DRAFT',
      inLobby: true,
      ready: true,
      session: {
        status: 'DRAFTING',
        mode: 'PICK_TWO_DRAFT',
        tableLabel: 'Table 1',
        seat: 2,
        seated: true,
        phaseAckCount: 1,
        selfAcked: false,
        opponentName: null,
        roundNumber: null,
        totalRounds: 3,
      },
    });
    expect(confirm.title).toBe('Confirm that you are done drafting');
    expect(confirm.actionLabel).toBe('Confirm that you are done drafting');

    const deck = limitedPlayerCue({
      mode: 'PICK_TWO_DRAFT',
      inLobby: true,
      ready: true,
      session: {
        status: 'DECKBUILDING',
        mode: 'PICK_TWO_DRAFT',
        tableLabel: 'Table 1',
        seat: 1,
        seated: true,
        phaseAckCount: 0,
        selfAcked: false,
        opponentName: null,
        roundNumber: null,
        totalRounds: 3,
      },
    });
    expect(deck.title).toBe(limitedDeckbuildingTitle());
    expect(deck.title).toBe('Time to make the best deck!');
    expect(deck.actionLabel).toBe('Deck is ready');
  });

  it('uses one-card packs for Booster Draft and skips the draft for Sealed', () => {
    expect(limitedDraftInstructions('BOOSTER_DRAFT')).toContain('Take one card');
    expect(limitedDraftInstructions('BOOSTER_DRAFT')).toContain(
      'left, then right, then left',
    );
    const sealed = limitedPlayerCue({
      mode: 'SEALED',
      inLobby: true,
      ready: true,
      session: {
        status: 'DECKBUILDING',
        mode: 'SEALED',
        tableLabel: 'Table 2',
        seat: 1,
        seated: true,
        phaseAckCount: 0,
        selfAcked: false,
        opponentName: null,
        roundNumber: null,
        totalRounds: 3,
      },
    });
    expect(sealed.title).toBe('Time to make the best deck!');
    expect(sealed.detail).toContain('Open 6 packs');
    expect(
      limitedHostCue({
        mode: 'SEALED',
        podSize: 4,
        joined: 4,
        ready: 4,
        deckMinutes: 45,
        roundMinutes: 50,
        session: {
          status: 'SEATING',
          seated: 4,
          active: 4,
          phaseAckCount: 0,
          tableLabel: 'Table 2',
          roundNumber: null,
          totalRounds: 3,
        },
      }),
    ).toMatchObject({
      action: 'start-deckbuilding',
      actionLabel: 'Start deckbuilding',
    });
    expect(
      limitedHostCue({
        mode: 'BOOSTER_DRAFT',
        podSize: 8,
        joined: 8,
        ready: 8,
        deckMinutes: 30,
        roundMinutes: 50,
        draftMinutes: 50,
        session: {
          status: 'SEATING',
          seated: 8,
          active: 8,
          phaseAckCount: 0,
          tableLabel: 'Table 1',
          roundNumber: null,
          totalRounds: 3,
        },
      }).actionLabel,
    ).toBe('Start draft');
  });
});

describe('Limited seat claims', () => {
  it('lets players take open seats, swap, and confirm', () => {
    let seats = chairs(['a', 'b', 'c', 'd']);
    seats = applyLimitedSeatChoice(seats, 'a', 1, 4);
    seats = applyLimitedSeatChoice(seats, 'b', 3, 4);
    expect(seats.find((row) => row.participantId === 'b')?.seat).toBe(3);
    expect(() => applyLimitedSeatChoice(seats, 'c', 1, 4)).toThrow(/open seat/);
    seats = applyLimitedSeatChoice(seats, 'c', 2, 4);
    seats = applyLimitedSeatChoice(seats, 'c', 1, 4);
    expect(seats.find((row) => row.participantId === 'c')?.seat).toBe(1);
    expect(seats.find((row) => row.participantId === 'a')?.seat).toBe(2);
    expect(seats.every((row) => !row.seated)).toBe(true);
    seats = seats.map((row) =>
      row.participantId === 'd' ? { ...row, seat: 4 } : row,
    );
    for (const id of ['a', 'b', 'c', 'd']) {
      seats = confirmLimitedSeat(seats, id);
    }
    expect(everyoneSeated(seats)).toBe(true);
    expect(() => confirmLimitedSeat(chairs(['a']), 'a')).toThrow(/Choose a seat/);
  });

  it('advances only when every active player confirms the phase', () => {
    expect(recordLimitedPhaseAck([], 'a', ['a', 'b'])).toEqual({
      acked: ['a'],
      complete: false,
    });
    expect(recordLimitedPhaseAck(['a'], 'b', ['a', 'b'])).toEqual({
      acked: ['a', 'b'],
      complete: true,
    });
  });
});

describe('Limited pairings by format', () => {
  const seated = ['p1', 'p2', 'p3', 'p4'].map((participantId, index) => ({
    participantId,
    draftSeat: index + 1,
  }));

  it('plays Pick-Two diagonals, then each remaining opponent', () => {
    expect(plannedLimitedRounds('PICK_TWO_DRAFT', 4)).toBe(3);
    expect(pickTwoRoundPairs(1)).toEqual([
      [1, 3],
      [2, 4],
    ]);
    const rounds = [1, 2, 3].map((roundNumber) =>
      pairLimitedRound({
        sessionId: 'pick-two',
        mode: 'PICK_TWO_DRAFT',
        roundNumber,
        participants: seated,
        previousMatches: [],
        bestOf: 1,
      }).matches.map((match) => [match.playerAId, match.playerBId]),
    );
    expect(rounds).toEqual([
      [
        ['p1', 'p3'],
        ['p2', 'p4'],
      ],
      [
        ['p1', 'p2'],
        ['p3', 'p4'],
      ],
      [
        ['p1', 'p4'],
        ['p2', 'p3'],
      ],
    ]);
    const seen = new Set(
      rounds.flat().map((pair) => [...pair].sort().join('|')),
    );
    expect(seen.size).toBe(6);
  });

  it('keeps Booster Draft and Sealed on Swiss, with at least three rounds', () => {
    expect(plannedLimitedRounds('BOOSTER_DRAFT', 8)).toBe(3);
    expect(plannedLimitedRounds('SEALED', 4)).toBe(3);
    const booster = pairLimitedRound({
      sessionId: 'booster',
      mode: 'BOOSTER_DRAFT',
      roundNumber: 1,
      participants: Array.from({ length: 8 }, (_, index) => ({
        participantId: `p${index + 1}`,
        draftSeat: index + 1,
      })),
      previousMatches: [],
      bestOf: 3,
    });
    expect(booster.matches).toHaveLength(4);
    const diagonals = new Set(['p1|p5', 'p2|p6', 'p3|p7', 'p4|p8']);
    const paired = booster.matches.map((match) =>
      [match.playerAId, match.playerBId].sort().join('|'),
    );
    expect(paired.every((pair) => diagonals.has(pair))).toBe(false);
  });
});
