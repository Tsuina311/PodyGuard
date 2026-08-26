import { describe, expect, it } from 'vitest';
import {
  ARCHENEMY_SCHEMES,
  randomPlayerId,
  randomTwoHeadedTeam,
  schemeById,
  shuffleSchemeIds,
} from './archenemy';

describe('Duskmourn scheme deck', () => {
  it('contains forty unique official schemes', () => {
    expect(ARCHENEMY_SCHEMES).toHaveLength(40);
    expect(new Set(ARCHENEMY_SCHEMES.map((scheme) => scheme.id)).size).toBe(40);
    expect(new Set(ARCHENEMY_SCHEMES.map((scheme) => scheme.name)).size).toBe(40);
    expect(ARCHENEMY_SCHEMES.filter((scheme) => scheme.ongoing)).toHaveLength(
      10,
    );
  });

  it('shuffles without dropping a card', () => {
    const shuffled = shuffleSchemeIds(() => 0);
    expect(shuffled).toHaveLength(40);
    expect(new Set(shuffled)).toEqual(
      new Set(ARCHENEMY_SCHEMES.map((scheme) => scheme.id)),
    );
    expect(shuffled).not.toEqual(
      ARCHENEMY_SCHEMES.map((scheme) => scheme.id),
    );
    expect(shuffled.every((id) => Boolean(schemeById(id)))).toBe(true);
  });

  it('can choose an archenemy or a two-player team at random', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(randomPlayerId(ids, () => 0.74)).toBe('c');
    const team = randomTwoHeadedTeam(ids, () => 0);
    expect(team).toHaveLength(2);
    expect(new Set(team).size).toBe(2);
    expect(team.every((id) => ids.includes(id))).toBe(true);
  });
});
