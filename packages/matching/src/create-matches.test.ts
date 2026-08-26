import { describe, expect, it } from 'vitest';
import { createMatches } from './create-matches.js';
import { eventMatchOptions, type ReadyParticipant } from './types.js';

function player(
  id: string,
  readyAt: number,
  pools: Array<{ poolId: string; preference?: 'preferred' | 'accepted' }>,
  flexCredits = 0,
): ReadyParticipant {
  return {
    id,
    readyAt,
    flexCredits,
    decks: pools.map((row, index) => ({
      id: `${id}-${row.poolId}-${String(index)}`,
      poolId: row.poolId,
      preference: row.preference ?? 'preferred',
    })),
  };
}

function tables(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `t${String(index + 1)}` }));
}

describe('createMatches', () => {
  it('makes one B3 pod of 4', () => {
    const people = Array.from({ length: 4 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(1));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.poolId).toBe('b3');
    expect(result.matches[0]?.seats).toHaveLength(4);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('makes two B3 pods of 4 from eight players', () => {
    const people = Array.from({ length: 8 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(2));
    expect(result.matches.map((row) => row.seats.length)).toEqual([4, 4]);
    expect(result.matches.every((row) => row.poolId === 'b3')).toBe(true);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('matches 4 of 5 when only one table is free', () => {
    const people = Array.from({ length: 5 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(1));
    expect(result.matches[0]?.seats).toHaveLength(4);
    expect(result.unmatchedIds).toHaveLength(1);
  });

  it('fills tables of 4 then a leftover 3 when nobody registered decks', () => {
    const people = Array.from({ length: 7 }, (_, index) =>
      player(`p${String(index + 1)}`, index, []),
    );
    const result = createMatches(people, tables(2));
    expect(result.matches.map((row) => row.seats.length)).toEqual([4, 3]);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('leaves a remainder under 3 unmatched', () => {
    const people = Array.from({ length: 5 }, (_, index) =>
      player(`p${String(index + 1)}`, index, []),
    );
    const result = createMatches(people, tables(2));
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.seats).toHaveLength(4);
    expect(result.unmatchedIds).toEqual(['p5']);
  });

  it('keeps same-pool pods and does not mix brackets', () => {
    const b2 = Array.from({ length: 4 }, (_, index) =>
      player(`b2-${String(index)}`, index, [{ poolId: 'b2' }]),
    );
    const b3 = Array.from({ length: 4 }, (_, index) =>
      player(`b3-${String(index)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches([...b2, ...b3], tables(2));
    expect(result.matches).toHaveLength(2);
    expect(new Set(result.matches.map((row) => row.poolId))).toEqual(
      new Set(['b2', 'b3']),
    );
    for (const match of result.matches) {
      expect(match.seats.every((seat) => seat.poolId === match.poolId)).toBe(true);
    }
  });

  it('assigns a flexible player to the pool that fills more seats', () => {
    const b2 = Array.from({ length: 15 }, (_, index) =>
      player(`b2-${String(index)}`, index, [{ poolId: 'b2' }]),
    );
    const b3 = Array.from({ length: 16 }, (_, index) =>
      player(`b3-${String(index)}`, 100 + index, [{ poolId: 'b3' }]),
    );
    const flex = player('flex', 200, [
      { poolId: 'b3', preference: 'preferred' },
      { poolId: 'b2', preference: 'accepted' },
    ]);
    const result = createMatches([...b2, ...b3, flex], tables(8));
    expect(result.matches).toHaveLength(8);
    expect(result.unmatchedIds).toEqual([]);
    const flexSeat = result.matches
      .flatMap((row) => row.seats)
      .find((seat) => seat.participantId === 'flex');
    expect(flexSeat?.poolId).toBe('b2');
    expect(flexSeat?.concession).toBe(true);
  });

  it('keeps the preferred pool when both options fill the same number of seats', () => {
    const b2 = Array.from({ length: 3 }, (_, index) =>
      player(`b2-${String(index)}`, index, [{ poolId: 'b2' }]),
    );
    const b3 = Array.from({ length: 3 }, (_, index) =>
      player(`b3-${String(index)}`, 10 + index, [{ poolId: 'b3' }]),
    );
    const flex = player('flex', 20, [
      { poolId: 'b3', preference: 'preferred' },
      { poolId: 'b2', preference: 'accepted' },
    ]);
    const result = createMatches([...b2, ...b3, flex], tables(2));
    const flexSeat = result.matches
      .flatMap((row) => row.seats)
      .find((seat) => seat.participantId === 'flex');
    expect(flexSeat?.poolId).toBe('b3');
    expect(flexSeat?.concession).toBe(false);
  });

  it('avoids a recent rematch when another partner is available', () => {
    const people = [
      player('a', 0, [{ poolId: 'b3' }]),
      player('b', 1, [{ poolId: 'b3' }]),
      player('c', 2, [{ poolId: 'b3' }]),
      player('d', 3, [{ poolId: 'b3' }]),
      player('e', 4, [{ poolId: 'b3' }]),
    ];
    const result = createMatches(people, tables(1), {
      groups: [['a', 'b', 'x', 'y']],
    });
    const ids = result.matches[0]?.seats.map((seat) => seat.participantId) ?? [];
    expect(ids).toEqual(expect.arrayContaining(['a', 'c', 'd', 'e']));
    expect(ids).not.toContain('b');
  });

  it('awards flex on a leftover 3-pod and spends it on a later clean 4', () => {
    const three = createMatches(
      Array.from({ length: 3 }, (_, index) =>
        player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
      ),
      tables(1),
    );
    expect(three.matches[0]?.seats.every((seat) => seat.flexDelta === 3)).toBe(
      true,
    );
  });

  it('seats a high-flex player over an equal-wait leftover', () => {
    const people = [
      player('a', 0, [{ poolId: 'b3' }]),
      player('b', 0, [{ poolId: 'b3' }]),
      player('c', 0, [{ poolId: 'b3' }]),
      player('d', 0, [{ poolId: 'b3' }], 4),
      player('e', 0, [{ poolId: 'b3' }]),
    ];
    const result = createMatches(people, tables(1));
    const ids = result.matches[0]?.seats.map((seat) => seat.participantId) ?? [];
    expect(ids).toContain('d');
    expect(ids).toHaveLength(4);
  });

  it('never lets flex beat a longer wait', () => {
    const people = [
      player('waited', 0, [{ poolId: 'b3' }]),
      player('b', 1, [{ poolId: 'b3' }]),
      player('c', 1, [{ poolId: 'b3' }]),
      player('d', 1, [{ poolId: 'b3' }]),
      player('flex', 10, [{ poolId: 'b3' }], 6),
    ];
    const result = createMatches(people, tables(1));
    const ids = result.matches[0]?.seats.map((seat) => seat.participantId) ?? [];
    expect(ids).toContain('waited');
    expect(ids).not.toContain('flex');
  });

  it('forms a 5-pod when the organiser allows 5', () => {
    const people = Array.from({ length: 5 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(1), { groups: [] }, {
      allowedSizes: [5, 4, 3],
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.seats).toHaveLength(5);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('still prefers two 4-pods over a 5 and a 3 when both are legal', () => {
    const people = Array.from({ length: 8 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(2), { groups: [] }, {
      allowedSizes: [5, 4, 3],
    });
    expect(result.matches.map((row) => row.seats.length).sort()).toEqual([4, 4]);
  });

  it('does not form a leftover 3 when 3-pods are disabled', () => {
    const people = Array.from({ length: 7 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(2), { groups: [] }, {
      allowedSizes: [4],
      preferredSize: 4,
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.seats).toHaveLength(4);
    expect(result.unmatchedIds).toHaveLength(3);
  });

  it('prefers 5-pods when the organiser sets 5 as the base size', () => {
    const people = Array.from({ length: 10 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(2), { groups: [] }, {
      allowedSizes: [5, 4],
      preferredSize: 5,
    });
    expect(result.matches.map((row) => row.seats.length)).toEqual([5, 5]);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('uses leftover 4s when a 5-base field cannot fill another 5', () => {
    const people = Array.from({ length: 9 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(2), { groups: [] }, {
      allowedSizes: [5, 4],
      preferredSize: 5,
    });
    expect(result.matches.map((row) => row.seats.length).sort()).toEqual([4, 5]);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('prefers 6-pods over three 4s when 6 is the base size', () => {
    const people = Array.from({ length: 12 }, (_, index) =>
      player(`p${String(index + 1)}`, index, [{ poolId: 'b3' }]),
    );
    const result = createMatches(people, tables(3), { groups: [] }, {
      allowedSizes: [6, 5, 4],
      preferredSize: 6,
    });
    expect(result.matches.map((row) => row.seats.length)).toEqual([6, 6]);
    expect(result.unmatchedIds).toEqual([]);
  });
});

describe('eventMatchOptions', () => {
  it('keeps commander on 4s with leftover 3s', () => {
    expect(
      eventMatchOptions({
        gameMode: 'commander',
        allowThreePods: true,
        allowFivePods: false,
      }),
    ).toEqual({ preferredSize: 4, allowedSizes: [4, 3] });
  });

  it('lets treachery prefer 5+ with leftover 4s', () => {
    expect(
      eventMatchOptions({
        gameMode: 'treachery',
        allowThreePods: true,
        allowFivePods: false,
        preferredPodSize: 5,
      }),
    ).toEqual({ preferredSize: 5, allowedSizes: [5, 4] });
    expect(
      eventMatchOptions({
        gameMode: 'treachery',
        allowThreePods: false,
        allowFivePods: true,
        preferredPodSize: 7,
      }),
    ).toEqual({ preferredSize: 7, allowedSizes: [7, 6, 5, 4] });
  });

  it('makes Two-Headed Giant strictly four players', () => {
    expect(
      eventMatchOptions({
        gameMode: 'two-headed-giant',
        allowThreePods: true,
        allowFivePods: true,
      }),
    ).toEqual({ preferredSize: 4, allowedSizes: [4] });
  });
});
