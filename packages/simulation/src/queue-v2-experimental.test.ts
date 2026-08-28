import { computeFlexDelta } from '@podyguard/matching';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { runSimulation } from './engine.js';
import { constant, defineScenario, uniform } from './scenario.js';
import { getScenario } from './scenarios.js';
import {
  createQueueV2ExperimentalStrategy,
  legacyV1Strategy,
  type MatchmakingInput,
  type MatchmakingParticipant,
  type MatchmakingStrategy,
} from './strategy.js';

const sweepGraceSeconds = [0, 30, 60, 90, 120, 180, 300] as const;

function participant(
  id: string,
  poolId = 'B3',
  readyAt = 0,
  flexCredits = 0,
): MatchmakingParticipant {
  return {
    id,
    readyAt,
    flexCredits,
    decks: [{ id: `${id}:${poolId}`, poolId, preference: 'preferred' }],
  };
}

function input(
  participants: MatchmakingParticipant[],
  overrides: Partial<MatchmakingInput> = {},
): MatchmakingInput {
  return {
    now: 5,
    participants,
    tables: [{ id: 't1' }, { id: 't2' }],
    priorGroups: [],
    settings: { preferredSize: 4, allowedSizes: [4, 3] },
    ...overrides,
  };
}

describe('queue-v2-experimental', () => {
  it('returns the exact legacy strategy instance for grace zero', () => {
    expect(createQueueV2ExperimentalStrategy(0)).toBe(legacyV1Strategy);
  });

  it('makes grace zero deep-equal to legacy on a representative matcher input', () => {
    const value = input(Array.from({ length: 11 }, (_, index) => participant(`p${index + 1}`)));
    const legacy = legacyV1Strategy.match(value);
    const experimental = createQueueV2ExperimentalStrategy(0);
    expect(experimental.match(value)).toEqual(legacy);
  });

  it('withholds a lone compatible three-pod and requests its exact grace boundary', () => {
    const value = input([participant('p1', 'B3', 2), participant('p2', 'B3', 3), participant('p3', 'B3', 4)]);
    expect(createQueueV2ExperimentalStrategy(10).match(value)).toEqual({
      matches: [],
      unmatchedIds: ['p1', 'p2', 'p3'],
      nextEvaluationAt: 12,
    });
  });

  it('allows the three-pod at the grace boundary', () => {
    const participants = [participant('p1', 'B3', 2), participant('p2', 'B3', 3), participant('p3', 'B3', 4)];
    const result = createQueueV2ExperimentalStrategy(10).match(
      input(participants, { now: 12 }),
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.seats).toHaveLength(3);
    expect(result.nextEvaluationAt).toBeUndefined();
  });

  it('passes a preferred four-pod immediately', () => {
    const result = createQueueV2ExperimentalStrategy(100).match(
      input(['p1', 'p2', 'p3', 'p4'].map((id) => participant(id))),
    );
    expect(result.matches.map((match) => match.seats.length)).toEqual([4]);
  });

  it('still withholds three compatible players when a fourth is incompatible', () => {
    const result = createQueueV2ExperimentalStrategy(100).match(
      input([
        participant('p1'),
        participant('p2'),
        participant('p3'),
        participant('other', 'B4'),
      ]),
    );
    expect(result.matches).toEqual([]);
    expect(new Set(result.unmatchedIds)).toEqual(new Set(['p1', 'p2', 'p3', 'other']));
  });

  it('does nothing when size three is illegal', () => {
    const value = input(['p1', 'p2', 'p3'].map((id) => participant(id)), {
      settings: { preferredSize: 4, allowedSizes: [4] },
    });
    expect(createQueueV2ExperimentalStrategy(100).match(value)).toEqual(
      legacyV1Strategy.match(value),
    );
  });

  it('withholds only the qualifying pod and preserves other matches', () => {
    const value = input([
      participant('a1', 'B4'),
      participant('a2', 'B4'),
      participant('a3', 'B4'),
      participant('a4', 'B4'),
      participant('b1', 'B3'),
      participant('b2', 'B3'),
      participant('b3', 'B3'),
    ]);
    const legacy = legacyV1Strategy.match(value);
    const result = createQueueV2ExperimentalStrategy(100).match(value);
    expect(result.matches).toEqual(legacy.matches.filter((match) => match.poolId !== 'B3'));
    expect(result.matches.some((match) => match.poolId === 'B4' && match.seats.length === 4)).toBe(true);
    expect(result.nextEvaluationAt).toBe(100);
  });

  it('preserves matcher invariants and Flex accounting across every sweep grace', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        poolId: fc.constantFrom('B3', 'B4'),
        readyAt: fc.integer({ min: 0, max: 100 }),
        flexCredits: fc.integer({ min: 0, max: 6 }),
      }), { maxLength: 30 }),
      fc.integer({ min: 0, max: 100 }),
      (shapes, now) => {
        const participants = shapes.map((shape, index) =>
          participant(`p${index}`, shape.poolId, Math.min(shape.readyAt, now), shape.flexCredits));
        const value = input(participants, {
          now,
          tables: Array.from({ length: 8 }, (_, index) => ({ id: `t${index}` })),
        });
        for (const graceSeconds of sweepGraceSeconds) {
          const before = structuredClone(value);
          const result = createQueueV2ExperimentalStrategy(graceSeconds).match(value);
          const seated = new Set<string>();
          const usedTables = new Set<string>();
          for (const match of result.matches) {
            expect(value.settings.allowedSizes).toContain(match.seats.length);
            expect(usedTables.has(match.tableId)).toBe(false);
            usedTables.add(match.tableId);
            for (const seat of match.seats) {
              expect(seated.has(seat.participantId)).toBe(false);
              seated.add(seat.participantId);
              const player = participants.find((entry) => entry.id === seat.participantId)!;
              expect(player.decks.some((deck) => deck.id === seat.deckId && deck.poolId === match.poolId)).toBe(true);
              expect(seat.flexDelta).toBe(computeFlexDelta({
                concession: seat.concession,
                podSize: match.seats.length,
                flexCredits: player.flexCredits,
                preferredSize: 4,
              }));
            }
          }
          expect(value).toEqual(before);
          expect([...seated, ...result.unmatchedIds].sort()).toEqual(
            participants.map((entry) => entry.id).sort(),
          );
        }
      },
    ), { numRuns: 300 });
  });
});

describe('experimental engine integration and paired randomization', () => {
  it('grace zero produces the exact legacy simulation result for fixed scenarios and seeds', () => {
    for (const scenarioId of ['SMALL_EVENT_8', 'NORMAL_FRIDAY_40', 'B4_STARVATION_30']) {
      for (const seed of [1, 47, 174]) {
        const options = { seed, randomizationMode: 'legacy' as const };
        expect(
          runSimulation(getScenario(scenarioId), {
            ...options,
            strategy: createQueueV2ExperimentalStrategy(0),
          }),
        ).toEqual(
          runSimulation(getScenario(scenarioId), {
            ...options,
            strategy: legacyV1Strategy,
          }),
        );
      }
    }
  });

  it('evaluates deterministically once at grace expiry and starts one withheld pod', () => {
    const result = runSimulation(defineScenario({
      id: 'EXPERIMENTAL_RETRY_TEST',
      description: 'Three-player grace retry.',
      playerCount: 3,
      durationSeconds: 30,
      tableCount: 1,
      initiallyDisabledTables: 0,
      preferredPodSize: 4,
      allowedPodSizes: [4, 3],
      arrivalSeconds: constant(0),
      readyDelaySeconds: constant(0),
      poolWeights: [{ value: 'B3', weight: 1 }],
      secondaryPoolProbability: 0,
      startingFlex: constant(0),
      gameDurationSeconds: constant(5),
      requeueProbability: 0,
      requeueDelaySeconds: constant(0),
      pauseProbability: 0,
      pauseDurationSeconds: constant(1),
      leaveProbability: 0,
      leaveWhileWaitingProbability: 0,
      pauseWhileWaitingProbability: 0,
      waitingDecisionDelaySeconds: constant(1),
      tableBreaks: [],
    }), {
      seed: 1,
      strategy: createQueueV2ExperimentalStrategy(10),
      debug: true,
    });

    expect(result.record.games).toHaveLength(1);
    expect(result.record.games[0]?.startedAt).toBe(10);
    expect(result.record.queueCycles.map((cycle) => cycle.endedAt)).toEqual([10, 10, 10]);
    expect(result.timeline?.filter((entry) => entry.event === 'match-evaluation')).toEqual([
      { at: 10, event: 'match-evaluation', detail: '' },
    ]);
    expect(result.metadata).toMatchObject({
      strategyId: 'queue-v2-experimental-grace-10s',
      strategyName: 'queue-v2-experimental',
      graceSeconds: 10,
    });
    expect(result.metadata.replay).toContain('--strategy queue-v2-experimental --grace 10');
  });

  it('keys paired durations by table slot and participant decisions by nth game', () => {
    const snapshots: Array<Map<string, unknown>> = [];
    const observing = (reverse: boolean): MatchmakingStrategy => ({
      id: reverse ? 'reverse' : 'forward',
      match(value) {
        const snapshot = new Map<string, unknown>();
        value.participants.forEach((entry) => snapshot.set(entry.id, {
          readyAt: entry.readyAt,
          decks: entry.decks,
          flexCredits: entry.flexCredits,
        }));
        snapshots.push(snapshot);
        if (value.participants.length < 4 || value.tables.length === 0) {
          return { matches: [], unmatchedIds: value.participants.map((entry) => entry.id) };
        }
        const ordered = reverse ? [...value.participants].reverse() : [...value.participants];
        const selected = ordered.slice(0, 4);
        const selectedIds = new Set(selected.map((entry) => entry.id));
        return {
          matches: [{
            tableId: value.tables[0]!.id,
            poolId: 'B3',
            seats: selected.map((entry) => {
              const deck = entry.decks.find((candidate) => candidate.poolId === 'B3')!;
              const preferredPool = entry.decks.find((candidate) => candidate.preference === 'preferred')?.poolId;
              const concession = preferredPool !== 'B3';
              return {
                participantId: entry.id,
                poolId: 'B3',
                deckId: deck.id,
                concession,
                flexDelta: computeFlexDelta({
                  concession,
                  podSize: 4,
                  flexCredits: entry.flexCredits,
                  preferredSize: 4,
                }),
              };
            }),
          }],
          unmatchedIds: value.participants
            .filter((entry) => !selectedIds.has(entry.id))
            .map((entry) => entry.id),
        };
      },
    });
    const pairedScenario = defineScenario({
      id: 'PAIRED_RANDOMIZATION_TEST',
      description: 'Common random number stream test.',
      playerCount: 8,
      durationSeconds: 200,
      tableCount: 1,
      initiallyDisabledTables: 0,
      preferredPodSize: 4,
      allowedPodSizes: [4],
      arrivalSeconds: constant(0),
      readyDelaySeconds: constant(0),
      poolWeights: [{ value: 'B3', weight: 1 }, { value: 'B4', weight: 1 }],
      secondaryPoolProbability: 1,
      startingFlex: uniform(0, 6),
      gameDurationSeconds: uniform(10, 40),
      requeueProbability: 0,
      requeueDelaySeconds: constant(0),
      pauseProbability: 0,
      pauseDurationSeconds: constant(1),
      leaveProbability: 0.5,
      leaveWhileWaitingProbability: 0,
      pauseWhileWaitingProbability: 0,
      waitingDecisionDelaySeconds: constant(1),
      tableBreaks: [],
    });

    const forward = runSimulation(pairedScenario, {
      seed: 99,
      strategy: observing(false),
      randomizationMode: 'paired-v1',
    });
    const forwardSnapshots = snapshots.splice(0);
    const reverse = runSimulation(pairedScenario, {
      seed: 99,
      strategy: observing(true),
      randomizationMode: 'paired-v1',
    });
    const reverseSnapshots = snapshots.splice(0);

    expect(forward.record.participants.map((entry) => entry.arrivedAt)).toEqual(
      reverse.record.participants.map((entry) => entry.arrivedAt),
    );
    expect(forwardSnapshots[0]).toEqual(reverseSnapshots[0]);
    expect(forward.record.games.map((game) => game.seats.map((seat) => seat.participantId)))
      .not.toEqual(reverse.record.games.map((game) => game.seats.map((seat) => seat.participantId)));
    expect(forward.record.games.map((game) => ({
      tableId: game.tableId,
      duration: game.endedAt - game.startedAt,
    }))).toEqual(reverse.record.games.map((game) => ({
      tableId: game.tableId,
      duration: game.endedAt - game.startedAt,
    })));
    const decisions = (result: typeof forward) => Object.fromEntries(
      result.record.games.flatMap((game) =>
        game.seats.map((seat) => [seat.participantId, seat.postGameDecision])),
    );
    expect(decisions(forward)).toEqual(decisions(reverse));
  });
});
