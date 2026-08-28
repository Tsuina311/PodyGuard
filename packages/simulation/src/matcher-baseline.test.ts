import { describe, expect, it } from 'vitest';
import {
  legacyV1Strategy,
  type MatchmakingInput,
  type MatchmakingParticipant,
} from './strategy.js';

type AdapterParticipant = MatchmakingParticipant & {
  status: 'ready' | 'playing' | 'paused' | 'left' | 'matched-active';
};

function participant(
  id: string,
  poolId = 'B3',
  readyAt = 0,
  status: AdapterParticipant['status'] = 'ready',
  acceptedPools: readonly string[] = [],
): AdapterParticipant {
  return {
    id,
    readyAt,
    status,
    flexCredits: 0,
    decks: [
      { id: `${id}:${poolId}:preferred`, poolId, preference: 'preferred' },
      ...acceptedPools.map((accepted, index) => ({
        id: `${id}:${accepted}:${index}`,
        poolId: accepted,
        preference: 'accepted' as const,
      })),
    ],
  };
}

function people(count: number, poolId = 'B3', prefix = poolId): AdapterParticipant[] {
  return Array.from({ length: count }, (_, index) =>
    participant(`${prefix}-${String(index + 1).padStart(3, '0')}`, poolId, index),
  );
}

function match(
  participants: readonly AdapterParticipant[],
  tableCount: number,
  options: {
    allowedSizes?: readonly number[];
    preferredSize?: number;
    priorGroups?: readonly (readonly string[])[];
    disabledTableIndexes?: readonly number[];
  } = {},
) {
  const disabled = new Set(options.disabledTableIndexes ?? []);
  const input: MatchmakingInput = {
    now: 10_000,
    participants: participants.filter((entry) => entry.status === 'ready'),
    tables: Array.from({ length: tableCount }, (_, index) => ({
      id: `table-${String(index + 1).padStart(2, '0')}`,
    })).filter((_, index) => !disabled.has(index)),
    priorGroups: options.priorGroups ?? [],
    settings: {
      preferredSize: options.preferredSize ?? 4,
      allowedSizes: options.allowedSizes ?? [4, 3],
    },
  };
  return legacyV1Strategy.match(input);
}

function sizes(result: ReturnType<typeof match>): number[] {
  return result.matches.map((entry) => entry.seats.length);
}

describe('legacy-v1 current matcher baseline', () => {
  it('packs 32 same-pool players into eight pods of four', () => {
    const result = match(people(32), 8);
    expect(sizes(result)).toEqual(Array(8).fill(4));
    expect(result.unmatchedIds).toEqual([]);
  });

  it('packs the valid 31-player baseline without invalid leftovers', () => {
    const result = match(people(31), 8);
    expect(sizes(result)).toEqual([4, 4, 4, 4, 4, 4, 4, 3]);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('moves one B2/B3-flexible player to fill 15 B2 and 16 B3 players', () => {
    const flex = participant('flex', 'B3', 100, 'ready', ['B2']);
    const result = match([...people(15, 'B2'), ...people(16, 'B3'), flex], 8);
    expect(sizes(result)).toEqual(Array(8).fill(4));
    expect(result.matches.flatMap((pod) => pod.seats).find((seat) => seat.participantId === 'flex'))
      .toMatchObject({ poolId: 'B2', concession: true });
  });

  it('packs seven as four plus three when three-player pods are enabled', () => {
    expect(sizes(match(people(7), 2))).toEqual([4, 3]);
  });

  it('leaves three of seven waiting when three-player pods are disabled', () => {
    const result = match(people(7), 2, { allowedSizes: [4] });
    expect(sizes(result)).toEqual([4]);
    expect(result.unmatchedIds).toHaveLength(3);
  });

  it('packs nine as three three-player pods under the current optimiser', () => {
    const result = match(people(9), 3);
    expect(sizes(result)).toEqual([3, 3, 3]);
    expect(result.unmatchedIds).toEqual([]);
  });

  it('caps twenty ready players at three available tables', () => {
    const result = match(people(20), 3);
    expect(sizes(result)).toEqual([4, 4, 4]);
    expect(result.unmatchedIds).toHaveLength(8);
  });

  it('does not pass a disabled table to the strategy', () => {
    const result = match(people(8), 2, { disabledTableIndexes: [0] });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.tableId).toBe('table-02');
  });

  it('excludes playing, paused, left, and matched-active participants', () => {
    const eligible = people(4);
    const ineligible = (['playing', 'paused', 'left', 'matched-active'] as const).map(
      (status, index) => participant(`excluded-${index}`, 'B3', 0, status),
    );
    const result = match([...eligible, ...ineligible], 2);
    expect(result.matches.flatMap((pod) => pod.seats.map((seat) => seat.participantId))).toEqual(
      eligible.map((entry) => entry.id),
    );
    expect(result.unmatchedIds).toEqual([]);
  });

  it('uses an accepted deck when multiple decks make a fuller assignment', () => {
    const flexible = participant('multi-deck', 'B3', 100, 'ready', ['B2', 'B4']);
    const result = match([...people(3, 'B2'), ...people(4, 'B3'), flexible], 2);
    expect(result.matches.flatMap((pod) => pod.seats).find((seat) => seat.participantId === 'multi-deck'))
      .toMatchObject({ poolId: 'B2', deckId: 'multi-deck:B2:0', concession: true });
  });

  it('keeps a long-waiting participant ahead of high-flex newer peers', () => {
    const waiting = participant('waited', 'B3', 0);
    const arrivals = people(4).map((entry, index) => ({
      ...entry,
      readyAt: 1_000 + index,
      flexCredits: 6,
    }));
    const result = match([waiting, ...arrivals], 1);
    const seated = result.matches[0]?.seats.map((seat) => seat.participantId) ?? [];
    expect(seated).toContain('waited');
  });

  it('orders otherwise equal new arrivals by stable input order', () => {
    const arrivals = people(5).map((entry) => ({ ...entry, readyAt: 500 }));
    const result = match(arrivals, 1);
    expect(result.matches[0]?.seats.map((seat) => seat.participantId)).toEqual(
      arrivals.slice(0, 4).map((entry) => entry.id),
    );
  });

  it('accepts prior group history without mutating it', () => {
    const history = [['B3-001', 'B3-002', 'old-a', 'old-b']];
    const snapshot = structuredClone(history);
    match(people(5), 1, { priorGroups: history });
    expect(history).toEqual(snapshot);
  });

  it('avoids a known rematch when an alternative player exists', () => {
    const result = match(people(5), 1, {
      priorGroups: [['B3-001', 'B3-002', 'old-a', 'old-b']],
    });
    const seated = result.matches[0]?.seats.map((seat) => seat.participantId) ?? [];
    expect(seated).toContain('B3-001');
    expect(seated).not.toContain('B3-002');
  });

  it('treats a requeued participant as an ordinary ready participant', () => {
    const requeued = { ...participant('requeued', 'B3', 0), flexCredits: 3 };
    const result = match([requeued, ...people(3).map((entry) => ({ ...entry, readyAt: 1 }))], 1);
    expect(result.matches[0]?.seats.map((seat) => seat.participantId)).toContain('requeued');
  });

  it('leaves the irreducible remainder of an odd field unmatched', () => {
    const result = match(people(11), 3, { allowedSizes: [4] });
    expect(sizes(result)).toEqual([4, 4]);
    expect(result.unmatchedIds).toHaveLength(3);
  });

  it('returns no matches when nobody is ready', () => {
    const result = match(people(8).map((entry) => ({ ...entry, status: 'paused' as const })), 8);
    expect(result).toEqual({ matches: [], unmatchedIds: [] });
  });

  it('does not invent pods when tables exceed ready-player demand', () => {
    const result = match(people(4), 50);
    expect(sizes(result)).toEqual([4]);
    expect(result.matches[0]?.tableId).toBe('table-01');
  });
});
