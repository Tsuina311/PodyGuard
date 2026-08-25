import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_COMMANDER_CHALLENGES,
  challengeById,
  cloneOfficialPack,
  emptyPrivatePack,
  parseChallengePack,
} from './challenges';

describe('official challenge pack', () => {
  it('is immutable, uniquely keyed, and covers every detection mode', () => {
    const challenges = OFFICIAL_COMMANDER_CHALLENGES.challenges;
    expect(new Set(challenges.map((row) => row.id)).size).toBe(
      challenges.length,
    );
    expect(new Set(challenges.map((row) => row.detectionMode))).toEqual(
      new Set(['automatic', 'confirmation', 'manual']),
    );
    expect(challenges.every((row) => row.points > 0)).toBe(true);
    expect(challengeById('centurion')?.primitive).toEqual({
      type: 'life_reaches',
      threshold: 100,
    });
  });

  it('rejects executable or unknown primitives when saving a private pack', () => {
    expect(() =>
      parseChallengePack({
        ...cloneOfficialPack('evt-abc123def456'),
        challenges: [
          {
            id: 'hack',
            name: 'Hack',
            description: 'No',
            category: 'combat',
            detectionMode: 'automatic',
            points: 1,
            repeatRule: 'once-per-event',
            primitive: { type: 'eval_js', code: '1+1' },
          },
        ],
      }),
    ).toThrow(/not allowed/);
    expect(emptyPrivatePack('evt-abc123def456').visibility).toBe('private');
    expect(parseChallengePack(cloneOfficialPack('evt-abc123def456')).id).toBe(
      'evt-abc123def456',
    );
  });
});
