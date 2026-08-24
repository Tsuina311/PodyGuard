import { describe, expect, it } from 'vitest';
import {
  applyTrackerAction,
  createTracker,
  elapsedMs,
  pickFirstPlayer,
} from './engine';
import { formatClock } from './TrackerView';

describe('match clock', () => {
  it('pads seconds and lets minutes run past an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(69_000)).toBe('1:09');
    expect(formatClock(94 * 60_000 + 12_000)).toBe('94:12');
  });

  it('freezes while paused and picks up again on resume', () => {
    const start = pickFirstPlayer(
      createTracker([{ id: 'a', name: 'Ada' }], 0),
      () => 0,
      0,
    );
    expect(formatClock(elapsedMs(start, 30_000))).toBe('0:30');

    const paused = applyTrackerAction(start, { type: 'pause' }, 30_000);
    // The reading holds however long the pause runs.
    expect(formatClock(elapsedMs(paused, 90_000))).toBe('0:30');

    const resumed = applyTrackerAction(paused, { type: 'pause' }, 90_000);
    expect(formatClock(elapsedMs(resumed, 100_000))).toBe('0:40');
  });
});
