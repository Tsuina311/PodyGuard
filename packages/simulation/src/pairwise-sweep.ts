import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_ARTIFACT_DIRECTORY } from './artifacts.js';
import { benchmarkSuite } from './benchmark.js';
import { runSimulation, SIMULATION_ENGINE_VERSION } from './engine.js';
import {
  aggregateGraceSweepRecords,
  type GraceSweepMetricSummary,
} from './grace-sweep.js';
import type { EventMetricRecord } from './metrics.js';
import {
  aggregateResidualPoolComparisons,
  type ResidualPoolComparisonSummary,
} from './residual-pool-metrics.js';
import {
  aggregateScarcityMetrics,
  type ScarcityMetricSummary,
} from './scarcity-metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION, getScenario } from './scenarios.js';
import {
  aggregateStarvationMetrics,
  type StarvationMetricSummary,
} from './starvation-metrics.js';
import {
  aggregateWeightedDecisions,
  type WeightedDecisionSummary,
} from './weighted-metrics.js';
import {
  WEIGHTED_PROFILES,
  createWeightedStrategy,
  type WeightedCandidateGeneratorConfig,
  type WeightedDecisionDiagnostic,
  type WeightedGeneratorMode,
  type WeightedProfile,
} from './weighted-strategy.js';

export const PAIRWISE_CANDIDATE_PLAN_CEILING = 128;
export const PAIRWISE_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-pairwise-experiment-2d.json',
);
export const PAIRWISE_REPLAY_SEEDS = {
  B4_STARVATION_30: [529, 231, 637],
  NORMAL_FRIDAY_40: [629, 74],
} as const;

export type PairwiseMetricSet = {
  existing: GraceSweepMetricSummary;
  scarcity: ScarcityMetricSummary;
  starvation: StarvationMetricSummary;
  weighted: WeightedDecisionSummary;
  residual: ResidualPoolComparisonSummary;
};

export type PairwiseSweepCandidate = {
  generatorMode: WeightedGeneratorMode;
  label: string;
  strategyId: string;
  profile: WeightedProfile;
  wallTimeMs: number;
  runtimeMultiplierVsSingle: number;
  global: PairwiseMetricSet;
  scenarios: Readonly<Record<string, PairwiseMetricSet>>;
};

export type PairwiseSeedReplay = {
  scenarioId: keyof typeof PAIRWISE_REPLAY_SEEDS;
  seed: number;
  profiles: ReadonlyArray<{
    profileId: string;
    label: string;
    single: ReplayResult;
    pairwise: ReplayResult;
  }>;
};

export type ReplayResult = {
  games: number;
  playedParticipants: number;
  longestExclusiveB4Waits: ReadonlyArray<{
    participantId: string;
    waitSeconds: number;
    reason: string;
  }>;
  decisions: readonly WeightedDecisionDiagnostic[];
};

export type PairwiseSweepResult = {
  schemaVersion: 1;
  generatedAt: string;
  metadata: {
    experiment: '2d-bounded-coordinated-candidate-generation';
    suiteVersion: string;
    engineVersion: string;
    randomizationMode: 'paired-v1';
    replayRandomizationMode: 'legacy';
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    candidatePlanCeiling: number;
    theoreticalBound: string;
    observedPreExperimentSizing: {
      readyParticipants: { p50: 6; p95: 8; max: 31 };
      readyMultiPoolParticipants: { p50: 2; p95: 5; max: 12 };
      singleUniqueCandidates: { p50: 2; p95: 3; max: 6 };
      maximumAcceptedPools: 2;
      largestObservedFrozenRawPairBound: 436;
    };
  };
  candidates: readonly PairwiseSweepCandidate[];
  seedReplays: readonly PairwiseSeedReplay[];
};

export function runPairwiseSweep(
  runs = 100,
  seedStart = 1,
  onProgress?: (completed: number, total: number) => void,
): PairwiseSweepResult {
  const modes: WeightedGeneratorMode[] = ['single', 'pairwise'];
  const total = modes.length * WEIGHTED_PROFILES.length * SCENARIOS.length * runs;
  let completedBeforeCandidate = 0;
  const candidates: PairwiseSweepCandidate[] = [];
  for (const profile of WEIGHTED_PROFILES) {
    let singleWallTime = 0;
    for (const generatorMode of modes) {
      const generatorConfig: WeightedCandidateGeneratorConfig = {
        mode: generatorMode,
        maxCandidatePlansPerDecision: PAIRWISE_CANDIDATE_PLAN_CEILING,
        recordControlOnlyDecisions: true,
      };
      const startedAt = performance.now();
      const benchmark = benchmarkSuite({
        runs,
        seedStart,
        strategy: createWeightedStrategy(profile, generatorConfig),
        randomizationMode: 'paired-v1',
        onProgress: (completed) =>
          onProgress?.(completedBeforeCandidate + completed, total),
      });
      const wallTimeMs = performance.now() - startedAt;
      completedBeforeCandidate += SCENARIOS.length * runs;
      if (generatorMode === 'single') singleWallTime = wallTimeMs;
      candidates.push({
        generatorMode,
        label: `${profile.label} · GENERATOR_${generatorMode.toUpperCase()}`,
        strategyId: benchmark.strategyId,
        profile,
        wallTimeMs,
        runtimeMultiplierVsSingle:
          generatorMode === 'single'
            ? 1
            : wallTimeMs / Math.max(1, singleWallTime),
        global: metricSet(benchmark.records),
        scenarios: Object.fromEntries(
          SCENARIOS.map((scenario) => {
            const records = benchmark.records.filter(
              (record) => record.scenarioId === scenario.id,
            );
            return [scenario.id, metricSet(records)];
          }),
        ),
      });
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      experiment: '2d-bounded-coordinated-candidate-generation',
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      randomizationMode: 'paired-v1',
      replayRandomizationMode: 'legacy',
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      candidatePlanCeiling: PAIRWISE_CANDIDATE_PLAN_CEILING,
      theoreticalBound:
        '1 + sum(single targets) + sum over READY multi-pool pairs of acceptedPools(i)*acceptedPools(j), O(R^2 P^2 * C_match). No three-player forcing.',
      observedPreExperimentSizing: {
        readyParticipants: { p50: 6, p95: 8, max: 31 },
        readyMultiPoolParticipants: { p50: 2, p95: 5, max: 12 },
        singleUniqueCandidates: { p50: 2, p95: 3, max: 6 },
        maximumAcceptedPools: 2,
        largestObservedFrozenRawPairBound: 436,
      },
    },
    candidates,
    seedReplays: runPairwiseSeedReplays(),
  };
}

export function writePairwiseSweep(
  result: PairwiseSweepResult,
  path = PAIRWISE_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

function metricSet(records: readonly EventMetricRecord[]): PairwiseMetricSet {
  return {
    existing: aggregateGraceSweepRecords(records, 0),
    scarcity: aggregateScarcityMetrics(records),
    starvation: aggregateStarvationMetrics(records),
    weighted: aggregateWeightedDecisions(records),
    residual: aggregateResidualPoolComparisons(records),
  };
}

function runPairwiseSeedReplays(): PairwiseSeedReplay[] {
  const replays: PairwiseSeedReplay[] = [];
  for (const [scenarioId, seeds] of Object.entries(
    PAIRWISE_REPLAY_SEEDS,
  ) as Array<
    [keyof typeof PAIRWISE_REPLAY_SEEDS, readonly number[]]
  >) {
    for (const seed of seeds) {
      replays.push({
        scenarioId,
        seed,
        profiles: WEIGHTED_PROFILES.map((profile) => ({
          profileId: profile.id,
          label: profile.label,
          single: replay(profile, 'single', scenarioId, seed),
          pairwise: replay(profile, 'pairwise', scenarioId, seed),
        })),
      });
    }
  }
  return replays;
}

function replay(
  profile: WeightedProfile,
  mode: WeightedGeneratorMode,
  scenarioId: keyof typeof PAIRWISE_REPLAY_SEEDS,
  seed: number,
): ReplayResult {
  const result = runSimulation(getScenario(scenarioId), {
    seed,
    strategy: createWeightedStrategy(profile, {
      mode,
      maxCandidatePlansPerDecision: PAIRWISE_CANDIDATE_PLAN_CEILING,
      recordControlOnlyDecisions: true,
    }),
    randomizationMode: 'legacy',
    debug: true,
  });
  const participantById = new Map(
    result.record.participants.map((participant) => [
      participant.id,
      participant,
    ]),
  );
  return {
    games: result.record.games.length,
    playedParticipants: new Set(
      result.record.games.flatMap((game) =>
        game.seats.map((seat) => seat.participantId),
      ),
    ).size,
    longestExclusiveB4Waits: result.record.queueCycles
      .filter((cycle) => {
        const participant = participantById.get(cycle.participantId);
        return (
          participant?.acceptedPoolIds?.length === 1 &&
          participant.acceptedPoolIds[0] === 'B4'
        );
      })
      .map((cycle) => ({
        participantId: cycle.participantId,
        waitSeconds: cycle.endedAt - cycle.startedAt,
        reason: cycle.reason,
      }))
      .sort(
        (left, right) =>
          right.waitSeconds - left.waitSeconds ||
          left.participantId.localeCompare(right.participantId),
      )
      .slice(0, 8),
    decisions: result.record.weightedDecisions ?? [],
  };
}
