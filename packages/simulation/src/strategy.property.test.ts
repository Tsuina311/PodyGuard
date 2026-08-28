import { computeFlexDelta } from '@podyguard/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  legacyV1Strategy,
  type MatchmakingInput,
  type MatchmakingParticipant,
} from './strategy.js';

type EventParticipant = MatchmakingParticipant & {
  status: 'joined' | 'ready' | 'playing' | 'paused' | 'left' | 'matched-active';
};

type GeneratedEventState = {
  now: number;
  participants: EventParticipant[];
  tables: Array<{ id: string; state: 'free' | 'occupied' | 'disabled' }>;
  allowedSizes: number[];
  priorGroups: string[][];
};

const configuredRuns = Number.parseInt(process.env.SIMULATION_PROPERTY_RUNS ?? '10000', 10);
const propertyRuns = Number.isSafeInteger(configuredRuns) && configuredRuns > 0 ? configuredRuns : 10_000;

const participantShape = fc.record({
  status: fc.constantFrom<EventParticipant['status']>(
    'joined',
    'ready',
    'ready',
    'ready',
    'playing',
    'paused',
    'left',
    'matched-active',
  ),
  readyAt: fc.nat({ max: 100_000 }),
  preferredPool: fc.constantFrom('B1', 'B2', 'B3', 'B4'),
  acceptedPools: fc.uniqueArray(fc.constantFrom('B1', 'B2', 'B3', 'B4'), {
    maxLength: 2,
  }),
  flexCredits: fc.integer({ min: 0, max: 6 }),
});

const participantShapes = fc.oneof(
  { weight: 19, arbitrary: fc.array(participantShape, { maxLength: 32 }) },
  { weight: 1, arbitrary: fc.array(participantShape, { minLength: 150, maxLength: 200 }) },
);

const tableStates = fc.oneof(
  {
    weight: 9,
    arbitrary: fc.array(fc.constantFrom('free', 'occupied', 'disabled') as fc.Arbitrary<
      'free' | 'occupied' | 'disabled'
    >, { maxLength: 12 }),
  },
  {
    weight: 1,
    arbitrary: fc.array(fc.constantFrom('free', 'occupied', 'disabled') as fc.Arbitrary<
      'free' | 'occupied' | 'disabled'
    >, { minLength: 40, maxLength: 50 }),
  },
);

const eventStateArbitrary: fc.Arbitrary<GeneratedEventState> = fc
  .record({
    now: fc.nat({ max: 100_000 }),
    participantShapes,
    tableStates,
    allowThree: fc.boolean(),
    historyStride: fc.integer({ min: 0, max: 7 }),
  })
  .map(({ now, participantShapes: shapes, tableStates: states, allowThree, historyStride }) => {
    const participants: EventParticipant[] = shapes.map((shape, index) => {
      const id = `p-${String(index).padStart(3, '0')}`;
      const pools = [
        shape.preferredPool,
        ...shape.acceptedPools.filter((pool) => pool !== shape.preferredPool),
      ];
      return {
        id,
        status: shape.status,
        readyAt: Math.min(shape.readyAt, now),
        flexCredits: shape.flexCredits,
        decks: pools.map((poolId, deckIndex) => ({
          id: `${id}:deck-${deckIndex}`,
          poolId,
          preference: deckIndex === 0 ? 'preferred' as const : 'accepted' as const,
        })),
      };
    });
    const tables = states.map((state, index) => ({
      id: `table-${String(index).padStart(2, '0')}`,
      state,
    }));
    const priorGroups =
      historyStride === 0
        ? []
        : participants
            .filter((_, index) => index % historyStride === 0)
            .slice(0, 16)
            .reduce<string[][]>((groups, entry, index) => {
              const groupIndex = Math.floor(index / 4);
              (groups[groupIndex] ??= []).push(entry.id);
              return groups;
            }, []);
    return {
      now,
      participants,
      tables,
      allowedSizes: allowThree ? [4, 3] : [4],
      priorGroups,
    };
  });

function adapterInput(state: GeneratedEventState): MatchmakingInput {
  return {
    now: state.now,
    participants: state.participants
      .filter((participant) => participant.status === 'ready')
      .map(({ status: _status, ...participant }) => participant),
    tables: state.tables
      .filter((table) => table.state === 'free')
      .map(({ state: _state, ...table }) => table),
    priorGroups: state.priorGroups,
    settings: { preferredSize: 4, allowedSizes: state.allowedSizes },
  };
}

function summary(state: GeneratedEventState): string {
  const statuses = Object.fromEntries(
    ['joined', 'ready', 'playing', 'paused', 'left', 'matched-active'].map((status) => [
      status,
      state.participants.filter((participant) => participant.status === status).length,
    ]),
  );
  return JSON.stringify({
    now: state.now,
    participantCount: state.participants.length,
    tableCount: state.tables.length,
    freeTables: state.tables.filter((table) => table.state === 'free').length,
    allowedSizes: state.allowedSizes,
    statuses,
  });
}

describe('legacy-v1 adapter properties', () => {
  it(
    `preserves hard invariants, input immutability, termination, and flex validity (${propertyRuns} runs)`,
    () => {
      fc.assert(
        fc.property(eventStateArbitrary, fc.context(), (state, context) => {
          const generatedContext = summary(state);
          context.log(generatedContext);
          const input = adapterInput(state);
          const before = structuredClone(input);
          const result = legacyV1Strategy.match(input);

          expect(input, generatedContext).toEqual(before);
          expect(result.matches.length, generatedContext).toBeLessThanOrEqual(input.tables.length);

          const participantsById = new Map(input.participants.map((entry) => [entry.id, entry]));
          const availableTables = new Set(input.tables.map((entry) => entry.id));
          const seated = new Set<string>();
          const usedTables = new Set<string>();

          for (const pod of result.matches) {
            expect(availableTables.has(pod.tableId), generatedContext).toBe(true);
            expect(usedTables.has(pod.tableId), generatedContext).toBe(false);
            usedTables.add(pod.tableId);
            expect(input.settings.allowedSizes, generatedContext).toContain(pod.seats.length);

            for (const seat of pod.seats) {
              const player = participantsById.get(seat.participantId);
              expect(player, generatedContext).toBeDefined();
              expect(seated.has(seat.participantId), generatedContext).toBe(false);
              seated.add(seat.participantId);
              expect(seat.poolId, generatedContext).toBe(pod.poolId);
              expect(player?.decks.some(
                (deck) => deck.id === seat.deckId && deck.poolId === seat.poolId,
              ), generatedContext).toBe(true);
              const preferredPool =
                player?.decks.find((deck) => deck.preference === 'preferred')?.poolId ??
                player?.decks[0]?.poolId;
              expect(seat.concession, generatedContext).toBe(seat.poolId !== preferredPool);
              expect(seat.flexDelta, generatedContext).toBe(
                computeFlexDelta({
                  concession: seat.concession,
                  podSize: pod.seats.length,
                  flexCredits: player?.flexCredits ?? 0,
                  preferredSize: input.settings.preferredSize,
                }),
              );
            }
          }

          expect(new Set(result.unmatchedIds).size, generatedContext).toBe(result.unmatchedIds.length);
          expect([...seated, ...result.unmatchedIds].sort(), generatedContext).toEqual(
            input.participants.map((entry) => entry.id).sort(),
          );
          expect(result.unmatchedIds.every((id) => !seated.has(id)), generatedContext).toBe(true);
        }),
        {
          numRuns: propertyRuns,
          verbose: true,
        },
      );
    },
    120_000,
  );
});
