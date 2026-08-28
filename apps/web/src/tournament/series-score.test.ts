import { describe, expect, it } from 'vitest';
import type { TournamentMatch } from '@podyguard/shared';
import { seriesHasProgress, seriesScoreLine } from './series-score';

function match(
  partial: Partial<TournamentMatch> &
    Pick<TournamentMatch, 'participantIds' | 'seriesWins'>,
): TournamentMatch {
  return {
    id: 'round-1-match-0',
    round: 1,
    position: 0,
    status: 'pending',
    bestOf: 3,
    ...partial,
  };
}

describe('seriesScoreLine', () => {
  it('formats seat-order tallies as 1-0 style scores', () => {
    expect(
      seriesScoreLine(
        match({
          participantIds: ['a', 'b'],
          seriesWins: { a: 1, b: 0 },
        }),
      ),
    ).toBe('1-0');
    expect(
      seriesScoreLine(
        match({
          participantIds: ['a', 'b'],
          seriesWins: { a: 1, b: 1 },
        }),
      ),
    ).toBe('1-1');
    expect(
      seriesScoreLine(
        match({
          participantIds: ['a', 'b'],
          seriesWins: { a: 2, b: 1 },
        }),
      ),
    ).toBe('2-1');
  });
});

describe('seriesHasProgress', () => {
  it('is false until someone wins a game', () => {
    expect(
      seriesHasProgress(
        match({
          participantIds: ['a', 'b'],
          seriesWins: { a: 0, b: 0 },
        }),
      ),
    ).toBe(false);
    expect(
      seriesHasProgress(
        match({
          participantIds: ['a', 'b'],
          seriesWins: { a: 1, b: 0 },
        }),
      ),
    ).toBe(true);
  });
});
