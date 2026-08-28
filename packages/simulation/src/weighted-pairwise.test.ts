import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { runSimulation } from './engine.js';
import { getScenario } from './scenarios.js';
import type {
  MatchmakingInput,
  MatchmakingParticipant,
} from './strategy.js';
import {
  WEIGHTED_PROFILES,
  createWeightedStrategy,
} from './weighted-strategy.js';

const propertyRuns = Number(process.env.PAIRWISE_PROPERTY_RUNS ?? 200);

function participant(
  id: string,
  pools: readonly string[],
  readyAt: number,
): MatchmakingParticipant {
  return {
    id,
    readyAt,
    flexCredits: 0,
    decks: pools.map((poolId, index) => ({
      id: `${id}:${poolId}`,
      poolId,
      preference: index === 0 ? 'preferred' : 'accepted',
    })),
  };
}

function pairOnlyInput(): MatchmakingInput {
  return {
    now: 1_200,
    participants: [
      participant('p0', ['B4'], 646),
      participant('p1', ['B2', 'B3'], 1_135),
      participant('p2', ['B3'], 1_093),
      participant('p3', ['B4', 'B3'], 424),
      participant('p4', ['B2'], 530),
      participant('p5', ['B3'], 1),
      participant('p6', ['B3'], 353),
      participant('p7', ['B2', 'B4'], 601),
      participant('p8', ['B3'], 574),
      participant('p9', ['B2'], 753),
      participant('p10', ['B3'], 1_127),
      participant('p11', ['B4', 'B2'], 674),
      participant('p12', ['B2'], 544),
    ],
    tables: [{ id: 't1' }, { id: 't2' }],
    priorGroups: [],
    settings: { preferredSize: 4, allowedSizes: [4, 3, 5] },
  };
}

function pairwise(ceiling = 128) {
  return createWeightedStrategy(WEIGHTED_PROFILES[1]!, {
    mode: 'pairwise',
    maxCandidatePlansPerDecision: ceiling,
  });
}

describe('Experiment 2D bounded pairwise generation', () => {
  it('exposes a useful plan that neither single force exposes', () => {
    const result = pairwise().match(pairOnlyInput());
    const decision = result.weightedDecision!;
    expect(decision.generator.singleCandidatesGenerated).toBe(0);
    expect(decision.generator.pairCandidatesGenerated).toBeGreaterThan(0);
    expect(decision.singleGeneratorSelectedCandidateKey).toBe('control');
    expect(decision.selectedRequiresTwoForces).toBe(true);
    expect(decision.immediateSeatDeltaVsSingleGenerator).toBe(-1);
    expect(
      decision.candidates.find((candidate) => candidate.selected)
        ?.forcedAssignments,
    ).toHaveLength(2);
  });

  it('only forces READY participants into explicitly accepted pools', () => {
    const input = pairOnlyInput();
    const result = pairwise().match(input);
    const participantById = new Map(
      input.participants.map((entry) => [entry.id, entry]),
    );
    for (const candidate of result.weightedDecision?.candidates ?? []) {
      expect(candidate.forcedAssignments.length).toBeLessThanOrEqual(2);
      for (const assignment of candidate.forcedAssignments) {
        const person = participantById.get(assignment.participantId);
        expect(person).toBeDefined();
        expect(
          person?.decks.some(
            (deck) => deck.poolId === assignment.poolId,
          ),
        ).toBe(true);
      }
    }
  });

  it('deduplicates complete plans and never admits loss above one seat', () => {
    const result = pairwise().match(pairOnlyInput());
    const candidates = result.weightedDecision?.candidates ?? [];
    const signatures = candidates.map((candidate) =>
      JSON.stringify(candidate.plan),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(
      candidates.every((candidate) => candidate.immediateSeatDelta >= -1),
    ).toBe(true);
  });

  it('is independent of pair enumeration order and deterministic', () => {
    const value = pairOnlyInput();
    const reversed = {
      ...value,
      participants: [...value.participants].reverse(),
    };
    const strategy = pairwise();
    expect(strategy.match(value)).toEqual(strategy.match(value));
    expect(strategy.match(reversed).matches).toEqual(
      strategy.match(value).matches,
    );
  });

  it('applies the candidate ceiling with explicit deterministic diagnostics', () => {
    const strategy = pairwise(2);
    const first = strategy.match(pairOnlyInput());
    const second = strategy.match(pairOnlyInput());
    expect(first).toEqual(second);
    expect(first.weightedDecision?.candidates.length).toBeLessThanOrEqual(
      2,
    );
    expect(first.weightedDecision?.generator.ceilingReached).toBe(true);
    expect(
      (first.weightedDecision?.generator.truncatedPairAssignments ?? 0) +
        (first.weightedDecision?.generator
          .truncatedSingleAssignments ?? 0),
    ).toBeGreaterThan(0);
  });

  it('produces identical records for the same configuration and seed', () => {
    const scenario = getScenario('NORMAL_FRIDAY_40');
    const first = runSimulation(scenario, {
      seed: 74,
      strategy: pairwise(),
      randomizationMode: 'paired-v1',
    }).record;
    const second = runSimulation(scenario, {
      seed: 74,
      strategy: pairwise(),
      randomizationMode: 'paired-v1',
    }).record;
    expect(first).toEqual(second);
  });

  it(
    `preserves legality and bounded loss across ${propertyRuns} random inputs`,
    () => {
      fc.assert(
        fc.property(
        fc.array(
          fc.record({
            preferred: fc.constantFrom('B2', 'B3', 'B4'),
            secondary: fc.option(fc.constantFrom('B2', 'B3', 'B4')),
            readyAt: fc.integer({ min: 0, max: 2_000 }),
          }),
          { maxLength: 20 },
        ),
        fc.integer({ min: 1, max: 5 }),
        (shapes, tableCount) => {
          const participants = shapes.map((shape, index) => {
            const pools = [
              shape.preferred,
              ...(shape.secondary &&
              shape.secondary !== shape.preferred
                ? [shape.secondary]
                : []),
            ];
            return participant(`p${index}`, pools, shape.readyAt);
          });
          const input: MatchmakingInput = {
            now: 2_000,
            participants,
            tables: Array.from(
              { length: tableCount },
              (_, index) => ({ id: `t${index}` }),
            ),
            priorGroups: [],
            settings: {
              preferredSize: 4,
              allowedSizes: [4, 3, 5],
            },
          };
          const before = structuredClone(input);
          const result = pairwise(64).match(input);
          const decision = result.weightedDecision;
          if (decision) {
            expect(decision.immediateSeatDelta).toBeGreaterThanOrEqual(-1);
            expect(
              decision.candidates.every(
                (candidate) =>
                  candidate.forcedAssignments.length <= 2 &&
                  candidate.immediateSeatDelta >= -1,
              ),
            ).toBe(true);
          }
          const participantById = new Map(
            participants.map((entry) => [entry.id, entry]),
          );
          const seated = new Set<string>();
          const tables = new Set<string>();
          for (const match of result.matches) {
            expect(input.settings.allowedSizes).toContain(
              match.seats.length,
            );
            expect(tables.has(match.tableId)).toBe(false);
            tables.add(match.tableId);
            for (const seat of match.seats) {
              expect(seated.has(seat.participantId)).toBe(false);
              seated.add(seat.participantId);
              expect(
                participantById
                  .get(seat.participantId)
                  ?.decks.some((deck) => deck.poolId === seat.poolId),
              ).toBe(true);
            }
          }
          expect(input).toEqual(before);
        },
        ),
        { numRuns: propertyRuns },
      );
    },
    propertyRuns >= 10_000 ? 30_000 : 5_000,
  );
});
