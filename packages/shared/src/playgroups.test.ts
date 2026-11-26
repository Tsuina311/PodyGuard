import { describe, expect, it } from 'vitest';
import type { PublicEvent } from './event-api';
import {
  deriveStatsForIdentity,
  isSavedDeckCompatibleWithEvent,
  poolIdFromBracket,
  type GameRecord,
  type GameResultType,
  type LimitedDeckSession,
} from './playgroups';

const baseEvent: PublicEvent = {
  id: 'evt-1',
  name: 'Friday Commander',
  joinCode: 'ABC123',
  status: 'open',
  gameMode: 'commander',
  rulesFormat: 'commander',
  allowThreePods: true,
  allowFivePods: false,
  preferredPodSize: 4,
  lifetimeHours: 24,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

describe('playgroups shared domain', () => {
  it('validates saved deck compatibility with event constraints', () => {
    const muldrothaDeck = {
      format: 'commander',
      commanderName: 'Muldrotha, the Gravetide',
      commanders: [],
      bracket: 3,
      poolId: poolIdFromBracket(3),
    };
    const normalDeck = {
      format: 'normal',
      commanderName: undefined,
      commanders: [],
      bracket: undefined,
      poolId: 'open',
    };
    const archivedDeck = {
      ...muldrothaDeck,
      archivedAt: '2026-10-01T00:00:00.000Z',
    };

    expect(isSavedDeckCompatibleWithEvent(muldrothaDeck, baseEvent)).toBe(true);
    expect(isSavedDeckCompatibleWithEvent(normalDeck, baseEvent)).toBe(false);
    expect(isSavedDeckCompatibleWithEvent(archivedDeck, baseEvent)).toBe(false);

    // Classic non-commander duel event rejects commander decks and accepts normal decks
    const classicDuelEvent: PublicEvent = {
      ...baseEvent,
      gameMode: 'duel',
      rulesFormat: 'normal',
    };
    expect(isSavedDeckCompatibleWithEvent(muldrothaDeck, classicDuelEvent)).toBe(
      false,
    );
    expect(isSavedDeckCompatibleWithEvent(normalDeck, classicDuelEvent)).toBe(
      true,
    );
  });

  it('derives wins, losses, draws, no-winner games, most-used commanders, and most-played-with', () => {
    const records: GameRecord[] = [
      {
        id: 'gr-1',
        source: 'PODYGUARD',
        sourceType: 'EVENT_POD',
        sourceId: 'pod-1',
        gameMode: 'commander',
        format: 'commander',
        endedAt: '2026-10-10T20:00:00.000Z',
        createdAt: '2026-10-10T20:00:00.000Z',
        participants: [
          {
            id: 'grp-1',
            gameRecordId: 'gr-1',
            guestProfileId: 'guest-alex',
            displayNameSnapshot: 'Alex',
            commanderNameSnapshot: 'Muldrotha, the Gravetide',
            bracketSnapshot: 3,
            resultType: 'WIN',
            placement: 1,
          },
          {
            id: 'grp-2',
            gameRecordId: 'gr-1',
            guestProfileId: 'guest-marie',
            displayNameSnapshot: 'Marie',
            commanderNameSnapshot: 'Atraxa, Praetors\' Voice',
            bracketSnapshot: 4,
            resultType: 'LOSS',
          },
          {
            id: 'grp-3',
            gameRecordId: 'gr-1',
            guestProfileId: 'guest-thomas',
            displayNameSnapshot: 'Thomas',
            resultType: 'LOSS',
          },
        ],
      },
      {
        id: 'gr-2',
        source: 'PODYGUARD',
        sourceType: 'EVENT_POD',
        sourceId: 'pod-2',
        gameMode: 'commander',
        format: 'commander',
        endedAt: '2026-10-17T21:00:00.000Z',
        createdAt: '2026-10-17T21:00:00.000Z',
        participants: [
          {
            id: 'grp-4',
            gameRecordId: 'gr-2',
            guestProfileId: 'guest-alex',
            displayNameSnapshot: 'Alex',
            commanderNameSnapshot: 'Muldrotha, the Gravetide',
            bracketSnapshot: 3,
            resultType: 'COMPLETED_NO_WINNER',
          },
          {
            id: 'grp-5',
            gameRecordId: 'gr-2',
            guestProfileId: 'guest-marie',
            displayNameSnapshot: 'Marie',
            resultType: 'COMPLETED_NO_WINNER',
          },
        ],
      },
    ];

    const stats = deriveStatsForIdentity(records, {
      guestProfileIds: ['guest-alex'],
    });
    expect(stats.gamesPlayed).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    expect(stats.draws).toBe(0);
    expect(stats.completedNoWinner).toBe(1);
    expect(stats.winRate).toBe(1);
    expect(stats.gamesByFormat).toEqual({ commander: 2 });
    expect(stats.mostUsedCommanders[0]).toMatchObject({
      commanderName: 'Muldrotha, the Gravetide',
      bracket: 3,
      games: 2,
      wins: 1,
    });
    expect(stats.mostPlayedWith).toEqual([
      {
        guestProfileId: 'guest-marie',
        displayName: 'Marie',
        gamesTogether: 2,
      },
      {
        guestProfileId: 'guest-thomas',
        displayName: 'Thomas',
        gamesTogether: 1,
      },
    ]);
    expect(stats.lastPlayedAt).toBe('2026-10-17T21:00:00.000Z');
  });

  it('groups Limited results by player and session and excludes byes', () => {
    const results: GameResultType[] = ['WIN', 'DRAW', 'LOSS', 'BYE', 'WIN'];
    const records = results.map((resultType, index): GameRecord => ({
      id: `record-${index}`,
      source: 'PODYGUARD',
      sourceType: 'LIMITED_MATCH',
      sourceId: `match-${index}`,
      eventId: 'event-1',
      gameMode: 'BOOSTER_DRAFT',
      format: 'limited',
      createdAt: `2026-10-1${index}T20:00:00.000Z`,
      participants: [{
        id: `seat-${index}`,
        gameRecordId: `record-${index}`,
        eventParticipantId: 'player-alex',
        guestProfileId: 'guest-alex',
        displayNameSnapshot: 'Alex',
        resultType,
      }],
    }));
    const sessions = new Map<string, LimitedDeckSession>(
      records.slice(0, 4).map((record, index) => {
        const pod = index === 2 ? 2 : 1;
        return [record.sourceId, {
          sessionId: `pod-${pod}`,
          mode: 'BOOSTER_DRAFT',
          eventName: 'Friday Draft',
          sessionLabel: `Booster Draft ${pod}`,
        }];
      }),
    );

    const stats = deriveStatsForIdentity(records, { guestProfileIds: ['guest-alex'] }, undefined, sessions);
    expect(stats).toMatchObject({
      gamesPlayed: 4,
      wins: 2,
      losses: 1,
      draws: 1,
      limitedDecks: [
        { id: 'pod-2:player-alex', matches: 1, wins: 0, draws: 0, losses: 1 },
        { id: 'pod-1:player-alex', matches: 2, wins: 1, draws: 1, losses: 0 },
      ],
    });
  });
});
