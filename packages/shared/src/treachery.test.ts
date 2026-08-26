import { describe, expect, it } from 'vitest';
import {
  assignTreacheryRoles,
  assignTreacheryIdentities,
  TREACHERY_IDENTITIES,
  treacheryDistribution,
  treacheryRolesForSize,
} from './treachery';

describe('Treachery roles', () => {
  it('contains the complete 62-card identity set', () => {
    expect(TREACHERY_IDENTITIES).toHaveLength(62);
    expect(new Set(TREACHERY_IDENTITIES.map((card) => card.id)).size).toBe(62);
    expect(
      Object.fromEntries(
        ['leader', 'guardian', 'assassin', 'traitor'].map((role) => [
          role,
          TREACHERY_IDENTITIES.filter((card) => card.role === role).length,
        ]),
      ),
    ).toEqual({ leader: 13, guardian: 18, assassin: 18, traitor: 13 });
  });

  it.each([
    [4, { leader: 1, guardian: 0, assassin: 2, traitor: 1 }],
    [5, { leader: 1, guardian: 1, assassin: 2, traitor: 1 }],
    [6, { leader: 1, guardian: 1, assassin: 3, traitor: 1 }],
    [7, { leader: 1, guardian: 2, assassin: 3, traitor: 1 }],
    [8, { leader: 1, guardian: 2, assassin: 3, traitor: 2 }],
  ])('uses the recommended %i-player distribution', (size, expected) => {
    expect(treacheryDistribution(treacheryRolesForSize(size))).toEqual(expected);
  });

  it('rejects pod sizes outside the supported range', () => {
    expect(() => treacheryRolesForSize(3)).toThrow(/between 4 and 8/);
    expect(() => treacheryRolesForSize(9)).toThrow(/between 4 and 8/);
  });

  it('assigns every seat exactly one shuffled role', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const assigned = assignTreacheryRoles(players, () => 0);
    expect([...assigned.keys()]).toEqual(players);
    expect(treacheryDistribution([...assigned.values()])).toEqual({
      leader: 1,
      guardian: 1,
      assassin: 2,
      traitor: 1,
    });
  });

  it('deals a unique identity matching each assigned role', () => {
    const roles = new Map([
      ['a', 'assassin' as const],
      ['b', 'assassin' as const],
      ['c', 'leader' as const],
      ['d', 'traitor' as const],
    ]);
    const identities = assignTreacheryIdentities(roles, () => 0);
    expect(new Set(identities.values()).size).toBe(4);
    for (const [participantId, identityId] of identities) {
      expect(
        TREACHERY_IDENTITIES.find((card) => card.id === identityId)?.role,
      ).toBe(roles.get(participantId));
    }
  });
});
