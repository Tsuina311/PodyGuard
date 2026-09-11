import { describe, expect, it } from 'vitest';
import {
  LIKELY_FREE_SOON_ELAPSED_RATIO,
  LIKELY_FREE_SOON_REMAINING_SECONDS,
  tableAvailabilityHint,
  typicalGameDurationSeconds,
} from './table-availability-hint';

describe('typicalGameDurationSeconds', () => {
  it('uses the event median when completed games exist', () => {
    expect(typicalGameDurationSeconds([3600, 4200, 4800], 'commander')).toEqual({
      typicalSeconds: 4200,
      sampleCount: 3,
      source: 'event',
    });
  });

  it('falls back to mode defaults when there is no event data', () => {
    expect(typicalGameDurationSeconds([], 'duel')).toEqual({
      typicalSeconds: 25 * 60,
      sampleCount: 0,
      source: 'default',
    });
  });
});

describe('tableAvailabilityHint', () => {
  const typicalSeconds = 3600;
  const startedAt = new Date('2026-09-01T18:00:00.000Z');

  it('returns null for formed pods', () => {
    expect(
      tableAvailabilityHint({
        podStatus: 'formed',
        playingStartedAt: startedAt.toISOString(),
        typicalSeconds,
        now: new Date('2026-09-01T18:30:00.000Z'),
      }),
    ).toBeNull();
  });

  it('flags likely free soon when remaining time is short', () => {
    const now = new Date(
      startedAt.getTime() +
        (typicalSeconds - LIKELY_FREE_SOON_REMAINING_SECONDS + 60) * 1000,
    );
    const hint = tableAvailabilityHint({
      podStatus: 'playing',
      playingStartedAt: startedAt,
      typicalSeconds,
      now,
    });
    expect(hint?.likelyFreeSoon).toBe(true);
    expect(hint?.estimatedRemainingSeconds).toBe(
      LIKELY_FREE_SOON_REMAINING_SECONDS - 60,
    );
  });

  it('flags likely free soon when elapsed exceeds the ratio threshold', () => {
    const now = new Date(
      startedAt.getTime() +
        Math.ceil(typicalSeconds * LIKELY_FREE_SOON_ELAPSED_RATIO) * 1000,
    );
    const hint = tableAvailabilityHint({
      podStatus: 'playing',
      playingStartedAt: startedAt,
      typicalSeconds,
      now,
    });
    expect(hint?.likelyFreeSoon).toBe(true);
  });

  it('does not flag early games', () => {
    const hint = tableAvailabilityHint({
      podStatus: 'playing',
      playingStartedAt: startedAt,
      typicalSeconds,
      now: new Date(startedAt.getTime() + 15 * 60 * 1000),
    });
    expect(hint?.likelyFreeSoon).toBe(false);
  });
});
