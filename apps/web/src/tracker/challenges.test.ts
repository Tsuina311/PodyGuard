import { describe, expect, it } from 'vitest';
import {
  applyTrackerAction,
  createTracker,
  primaryCommanderId,
} from './engine';
import {
  detectAutomaticChallenges,
  detectedConfirmation,
} from './challenges';

function ids(
  detected: ReturnType<typeof detectAutomaticChallenges>,
): string[] {
  return detected.map((row) => `${row.participantId}:${row.challenge.id}`);
}

describe('official tracker challenges', () => {
  it('detects life thresholds and a low-life comeback', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'a',
      delta: 60,
    });
    expect(ids(detectAutomaticChallenges(state))).toContain('a:centurion');

    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'b',
      delta: -35,
    });
    state = applyTrackerAction(state, { type: 'winner', playerId: 'b' });
    expect(ids(detectAutomaticChallenges(state))).toContain('b:comeback');
  });

  it('distinguishes commander and poison finishes', () => {
    let commander = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    commander = applyTrackerAction(commander, {
      type: 'commander',
      commanderId: primaryCommanderId('a'),
      toId: 'b',
      delta: 21,
    });
    commander = applyTrackerAction(commander, {
      type: 'confirmLoss',
      playerId: 'b',
    });
    expect(ids(detectAutomaticChallenges(commander))).toContain(
      'a:commander-finish',
    );

    let poison = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    poison = applyTrackerAction(poison, {
      type: 'poison',
      playerId: 'b',
      delta: 10,
    });
    poison = applyTrackerAction(poison, {
      type: 'confirmLoss',
      playerId: 'b',
    });
    expect(ids(detectAutomaticChallenges(poison))).toContain('a:toxic');
  });

  it('asks for the smallest useful context after multiple eliminations', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
    ]);
    state = applyTrackerAction(state, { type: 'eliminate', playerId: 'b' });
    state = applyTrackerAction(state, { type: 'eliminate', playerId: 'c' });

    expect(detectedConfirmation(state)).toMatchObject({
      participantId: 'a',
      challenge: { id: 'double-kill', detectionMode: 'confirmation' },
    });
  });
});
