import { describe, expect, it } from 'vitest';
import type { EventSnapshot, PublicLimitedSession } from '@podyguard/shared';
import {
  activeLimitedSession,
  currentLimitedMatch,
  formatLimitedTimer,
  scoreForOutcome,
} from './limited-view';

const session: PublicLimitedSession = {
  id: 'limited-1',
  mode: 'BOOSTER_DRAFT',
  status: 'ROUND_ACTIVE',
  label: 'Draft 1',
  participants: [
    { participantId: 'p1', displayName: 'Ada', status: 'PLAYING', joinedAt: '2026-01-01T00:00:00.000Z' },
    { participantId: 'p2', displayName: 'Bob', status: 'PLAYING', joinedAt: '2026-01-01T00:00:00.000Z' },
  ],
  rounds: [{
    id: 'r1',
    number: 1,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    matches: [{
      id: 'm1',
      roundNumber: 1,
      position: 1,
      playerAId: 'p1',
      playerBId: 'p2',
      status: 'PLAYING',
      bestOf: 3,
    }],
  }],
  standings: [],
  matchStructure: 'BO3',
  pairingPolicy: 'SWISS',
  minCohortSize: 4,
  allowUndersizedLaunch: false,
  currentRound: 1,
  totalRounds: 3,
  draftTableIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const snapshot: EventSnapshot = {
  event: {
    id: 'e1',
    name: 'Night',
    joinCode: 'ABCD',
    status: 'open',
    gameMode: 'commander',
    rulesFormat: 'commander',
    allowThreePods: true,
    allowFivePods: false,
    preferredPodSize: 4,
    lifetimeHours: 24,
    expiresAt: '2026-01-02T00:00:00.000Z',
  },
  participants: [],
  tables: [],
  limitedSessions: [session],
};

describe('limited view selectors', () => {
  it('selects a player session and current pairing', () => {
    expect(activeLimitedSession(snapshot, 'p1')?.id).toBe('limited-1');
    expect(currentLimitedMatch(session, 'p1')?.id).toBe('m1');
    expect(currentLimitedMatch(session, 'other')).toBeUndefined();
  });

  it('prefers current play over an older completed session', () => {
    const completed = {
      ...session,
      id: 'limited-old',
      status: 'COMPLETED' as const,
    };
    expect(
      activeLimitedSession(
        { ...snapshot, limitedSessions: [completed, session] },
        'p1',
      )?.id,
    ).toBe('limited-1');
  });

  it('formats the authoritative shared timer calculation', () => {
    expect(formatLimitedTimer({
      phase: 'ROUND',
      status: 'RUNNING',
      durationSeconds: 600,
      startedAt: '2026-01-01T00:00:00.000Z',
      targetAt: '2026-01-01T00:10:00.000Z',
    }, '2026-01-01T00:08:29.500Z')).toBe('01:31');
  });

  it('derives valid default game scores', () => {
    expect(scoreForOutcome('PLAYER_A_WIN', 3)).toEqual({
      playerAGameWins: 2,
      playerBGameWins: 0,
    });
    expect(scoreForOutcome('DRAW', 1)).toEqual({
      playerAGameWins: 0,
      playerBGameWins: 0,
    });
  });
});
