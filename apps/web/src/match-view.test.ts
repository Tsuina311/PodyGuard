import { describe, expect, it } from 'vitest';
import type { EventSnapshot, PublicParticipant } from '@podyguard/shared';
import {
  assignedDeckLine,
  countByStatus,
  queueByWait,
  tableForParticipant,
} from './match-view';

function player(
  patch: Partial<PublicParticipant> &
    Pick<PublicParticipant, 'id' | 'displayName' | 'status'>,
): PublicParticipant {
  return {
    isBot: false,
    decks: [],
    assignedCommanders: [],
    flexCredits: 0,
    ...patch,
  };
}

describe('match-view', () => {
  it('finds the occupied table for a seated player', () => {
    const participant = player({
      id: 'p1',
      displayName: 'Ada',
      status: 'matched',
      tableLabel: 'Table 2',
      assignedPoolId: 'b2',
      assignedDeckName: 'Giada',
    });
    const snapshot: EventSnapshot = {
      event: {
        id: 'e',
        name: 'Night',
        joinCode: 'ABCD',
        status: 'open',
        gameMode: 'commander',
        allowThreePods: true,
        allowFivePods: false,
        preferredPodSize: 4,
        lifetimeHours: 24,
        expiresAt: '2026-08-27T18:00:00.000Z',
      },
      participants: [participant],
      tables: [
        {
          id: 't1',
          label: 'Table 1',
          sortOrder: 1,
          status: 'free',
          seatedNames: [],
        },
        {
          id: 't2',
          label: 'Table 2',
          sortOrder: 2,
          status: 'occupied',
          seatedNames: ['Ada', 'Bob'],
          podStatus: 'formed',
          poolId: 'b2',
        },
      ],
    };
    expect(tableForParticipant(snapshot, participant)?.id).toBe('t2');
    expect(assignedDeckLine(participant)).toBe('Giada');
  });

  it('orders the ready queue by who has waited longest', () => {
    const later = player({
      id: 'p2',
      displayName: 'Bea',
      status: 'ready',
      readyAt: '2026-08-23T18:10:00.000Z',
    });
    const earlier = player({
      id: 'p1',
      displayName: 'Ada',
      status: 'ready',
      readyAt: '2026-08-23T18:00:00.000Z',
    });
    expect(queueByWait([later, earlier]).map((row) => row.displayName)).toEqual([
      'Ada',
      'Bea',
    ]);
  });

  it('counts organiser dashboard buckets', () => {
    expect(
      countByStatus([
        player({ id: 'a', displayName: 'A', status: 'ready' }),
        player({ id: 'b', displayName: 'B', status: 'matched' }),
        player({ id: 'c', displayName: 'C', status: 'playing' }),
        player({ id: 'd', displayName: 'D', status: 'paused' }),
      ]),
    ).toEqual({ ready: 1, matched: 1, playing: 1, paused: 1 });
  });
});
