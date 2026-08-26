import { describe, expect, it } from 'vitest';
import { createTracker, STARTING_LIFE, type TrackerState } from './engine';
import {
  HISTORY_LIMIT,
  reduceHistory,
  type Msg,
  type TrackerHistory,
} from './TrackerView';

function start(): TrackerHistory {
  return {
    present: createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]),
    past: [],
  };
}

function play(history: TrackerHistory, ...messages: Msg[]): TrackerHistory {
  return messages.reduce(reduceHistory, history);
}

function life(state: TrackerState): number | undefined {
  return state.players[0]?.life;
}

describe('match history', () => {
  it('starts Treachery with the assigned Leader', () => {
    const played = play(start(), { type: 'first', playerId: 'b' });
    expect(played.present.firstPlayerId).toBe('b');
  });

  it('walks back the last change and leaves the rest standing', () => {
    const played = play(
      start(),
      { type: 'action', action: { type: 'life', playerId: 'a', delta: -5 } },
      { type: 'action', action: { type: 'poison', playerId: 'a', delta: 1 } },
    );
    expect(life(played.present)).toBe(STARTING_LIFE - 5);

    const undone = play(played, { type: 'undo' });
    expect(undone.present.players[0]?.poison).toBe(0);
    expect(life(undone.present)).toBe(STARTING_LIFE - 5);

    const twice = play(undone, { type: 'undo' });
    expect(life(twice.present)).toBe(STARTING_LIFE);
  });

  it('has nothing to walk back at the start of a game', () => {
    const fresh = start();
    expect(play(fresh, { type: 'undo' })).toBe(fresh);
  });

  it('keeps no entry for an action the engine refused', () => {
    const decided = play(start(), {
      type: 'action',
      action: { type: 'winner', playerId: 'a' },
    });
    // A finished game ignores everything but the clock, so nothing is recorded.
    const after = play(decided, {
      type: 'action',
      action: { type: 'life', playerId: 'b', delta: -1 },
    });
    expect(after).toBe(decided);
    expect(play(after, { type: 'undo' }).present.winnerId).toBeNull();
  });

  it('remembers only the most recent steps', () => {
    const taps: Msg[] = Array.from({ length: HISTORY_LIMIT + 5 }, () => ({
      type: 'action' as const,
      action: { type: 'life' as const, playerId: 'a', delta: -1 },
    }));
    const played = play(start(), ...taps);
    expect(played.past).toHaveLength(HISTORY_LIMIT);
    expect(life(played.present)).toBe(STARTING_LIFE - (HISTORY_LIMIT + 5));
  });
});
