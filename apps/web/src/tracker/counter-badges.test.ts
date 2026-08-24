import { describe, expect, it } from 'vitest';
import { applyTrackerAction, createTracker, POISON_LIMIT } from './engine';
import { heldCounters } from './TrackerView';

function seat() {
  return createTracker([{ id: 'a', name: 'Ada' }]);
}

describe('counter badges', () => {
  it('badges only the counters a seat holds', () => {
    let state = seat();
    expect(heldCounters(state.players[0]!)).toEqual([]);

    state = applyTrackerAction(state, {
      type: 'poison',
      playerId: 'a',
      delta: 3,
    });
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'energy',
      delta: 4,
    });
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'experience',
      delta: 2,
    });

    expect(
      heldCounters(state.players[0]!).map((row) => [row.definition.id, row.value]),
    ).toEqual([
      ['poison', 3],
      ['energy', 4],
      ['experience', 2],
    ]);
  });

  it('drops a badge once the counter is walked back to zero', () => {
    let state = applyTrackerAction(seat(), {
      type: 'counter',
      playerId: 'a',
      counter: 'rad',
      delta: 2,
    });
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'rad',
      delta: -2,
    });
    expect(heldCounters(state.players[0]!)).toEqual([]);
  });

  it('colours a count that is closing on a loss', () => {
    let state = applyTrackerAction(seat(), {
      type: 'poison',
      playerId: 'a',
      delta: POISON_LIMIT - 3,
    });
    expect(heldCounters(state.players[0]!)[0]?.tone).toContain('text-warning');

    state = applyTrackerAction(state, {
      type: 'poison',
      playerId: 'a',
      delta: 3,
    });
    expect(heldCounters(state.players[0]!)[0]?.tone).toContain('text-danger');

    // A resource counter has no threshold to warn about.
    const energy = applyTrackerAction(seat(), {
      type: 'counter',
      playerId: 'a',
      counter: 'energy',
      delta: 40,
    });
    expect(heldCounters(energy.players[0]!)[0]?.tone).toBe('');
  });
});
