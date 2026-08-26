import { describe, expect, it } from 'vitest';
import {
  treacheryDistribution,
  treacheryIdentityById,
  treacheryRolesForSize,
} from '@podyguard/shared';
import { dealTreacheryIdentities } from './treachery';

describe('Treachery identities dealt on one device', () => {
  it('deals the printed role mix and a matching identity card each', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'];
    const deal = dealTreacheryIdentities(players, () => 0);
    expect(deal.map((row) => row.playerId)).toEqual(players);
    expect(treacheryDistribution(deal.map((row) => row.role))).toEqual(
      treacheryDistribution(treacheryRolesForSize(players.length)),
    );
    expect(new Set(deal.map((row) => row.identityId)).size).toBe(players.length);
    for (const row of deal) {
      expect(treacheryIdentityById(row.identityId)?.role).toBe(row.role);
    }
  });

  it('refuses table sizes Treachery does not print and duplicate ids', () => {
    expect(dealTreacheryIdentities(['a', 'b', 'c'])).toEqual([]);
    expect(
      dealTreacheryIdentities(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']),
    ).toEqual([]);
    expect(dealTreacheryIdentities(['a', 'a', 'b', 'c'])).toEqual([]);
  });
});
