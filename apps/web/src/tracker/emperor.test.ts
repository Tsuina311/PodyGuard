import { describe, expect, it } from 'vitest';
import {
  randomEmperorTeams,
  randomEmperors,
  seatEmperorTeam,
} from './emperor';

const players = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('Emperor setup', () => {
  it('randomly divides six unique players into two teams of three', () => {
    const teams = randomEmperorTeams(players, () => 0);
    expect(teams.map((team) => team.length)).toEqual([3, 3]);
    expect(new Set(teams.flat())).toEqual(new Set(players));
  });

  it('randomly chooses one emperor from each team', () => {
    expect(
      randomEmperors(
        [
          ['a', 'b', 'c'],
          ['d', 'e', 'f'],
        ],
        () => 0,
      ),
    ).toEqual(['a', 'd']);
  });

  it('seats the emperor between their generals', () => {
    expect(seatEmperorTeam(['a', 'b', 'c'], 'b')).toEqual(['a', 'b', 'c']);
    expect(seatEmperorTeam(['a', 'b', 'c'], 'a')).toEqual(['b', 'a', 'c']);
  });
});
