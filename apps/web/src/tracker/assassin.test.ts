import { describe, expect, it } from 'vitest';
import { assassinTargets, dealAssassinContracts } from './assassin';

describe('Assassin contracts', () => {
  it('deals every player into one secret circular contract chain', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const order = dealAssassinContracts(players, () => 0);
    const targets = assassinTargets(order);
    expect(new Set(order)).toEqual(new Set(players));
    expect(Object.keys(targets)).toHaveLength(players.length);
    for (const player of players) {
      expect(targets[player]).not.toBe(player);
    }
    expect(new Set(Object.values(targets))).toEqual(new Set(players));
  });

  it('refuses fewer than three players or duplicate ids', () => {
    expect(dealAssassinContracts(['a', 'b'])).toEqual([]);
    expect(dealAssassinContracts(['a', 'a', 'b'])).toEqual([]);
  });
});
