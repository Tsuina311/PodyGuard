import { describe, expect, it } from 'vitest';
import { createTracker, applyTrackerAction } from './engine';
import { allySeatPairs } from './ally-arrows';

describe('allySeatPairs', () => {
  it('links consecutive Star seats around the circle', () => {
    let state = createTracker([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cleo' },
      { id: 'd', name: 'Dev' },
      { id: 'e', name: 'Eli' },
    ]);
    state = applyTrackerAction(state, {
      type: 'starSeats',
      order: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(allySeatPairs(state, 'star')).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['d', 'e'],
      ['e', 'a'],
    ]);
  });

  it('links Two-Headed Giant teammates', () => {
    let state = createTracker([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cleo' },
      { id: 'd', name: 'Dev' },
    ]);
    state = applyTrackerAction(state, {
      type: 'teams',
      teams: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
    expect(allySeatPairs(state, 'two-headed-giant')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('skips the solo Archenemy and links the heroes', () => {
    let state = createTracker([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cleo' },
      { id: 'd', name: 'Dev' },
    ]);
    state = applyTrackerAction(state, {
      type: 'teams',
      mode: 'archenemy-commander',
      teams: [['a'], ['b', 'c', 'd']],
      schemeOrder: ['s1'],
    });
    expect(allySeatPairs(state, 'archenemy-commander')).toEqual([
      ['b', 'c'],
      ['c', 'd'],
    ]);
  });
});
