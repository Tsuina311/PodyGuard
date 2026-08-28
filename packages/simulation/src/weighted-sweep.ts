import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  aggregateScarcityMetrics,
  type ScarcityMetricSummary,
} from './scarcity-metrics.js';
import type {
  SeatLossMetricSet,
  SeatLossSweepResult,
} from './scarcity-seat-loss-sweep.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION, getScenario } from './scenarios.js';
import {
  createFrozenQueueV2GraceStrategy,
  type MatchmakingStrategy,
} from './strategy.js';
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
  type WeightedDecisionDiagnostic,
  type WeightedProfile,
} from './weighted-strategy.js';

export const WEIGHTED_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-weighted-experiment-2c.json',
);
export const WEIGHTED_REFERENCE_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-scarcity-experiment-2b.json',
);
export const WEIGHTED_REPLAY_SEEDS = {
  NORMAL_FRIDAY_40: [629, 74],
  B4_STARVATION_30: [637, 529, 231],
} as const;
export const WEIGHTED_FOCUS_SCENARIOS = [
  'B4_STARVATION_30',
  'NORMAL_FRIDAY_40',
  'NORMAL_FRIDAY_20',
  'SMALL_EVENT_8',
  'LOW_REQUEUE_40',
  'TABLE_SCARCITY_50',
  'LONG_GAMES_40',
] as const;

export type WeightedMetricSet = {
  existing: GraceSweepMetricSummary;
  scarcity: ScarcityMetricSummary;
  starvation: StarvationMetricSummary;
  weighted: WeightedDecisionSummary;
};

export type WeightedSweepCandidate = {
  kind: 'control' | 'weighted';
  label: string;
  strategyId: string;
  profile?: WeightedProfile;
  global: WeightedMetricSet;
  scenarios: Readonly<Record<string, WeightedMetricSet>>;
};

export type WeightedReference = {
  label: 'Experiment 2A zero-seat-loss' | 'Experiment 2B 600s' | 'Experiment 2B 1200s';
  sourcePath: string;
  global: SeatLossMetricSet;
  scenarios: Readonly<Record<string, SeatLossMetricSet>>;
};

export type WeightedSeedReplay = {
  scenarioId: keyof typeof WEIGHTED_REPLAY_SEEDS;
  seed: number;
  randomizationMode: 'legacy';
  frozenControl: {
    games: number;
    playedParticipants: number;
  };
  profiles: ReadonlyArray<{
    profileId: string;
    label: string;
    games: number;
    playedParticipants: number;
    scoredDecisionCount: number;
    changedDecisionCount: number;
    consideredDecisions: readonly WeightedDecisionDiagnostic[];
    changedDecisions: readonly WeightedDecisionDiagnostic[];
    longestB4ExclusiveCycles: ReadonlyArray<{
      participantId: string;
      waitSeconds: number;
      reason: string;
      startedAt: number;
      endedAt: number;
    }>;
  }>;
};

export type WeightedSweepResult = {
  schemaVersion: 1;
  generatedAt: string;
  metadata: {
    experiment: '2c-explainable-weighted-assignment';
    suiteVersion: string;
    engineVersion: string;
    randomizationMode: 'paired-v1';
    replayRandomizationMode: 'legacy';
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    scenarioIds: readonly string[];
    candidateGeneration: string;
    complexityBound: string;
    scoreDefinitions: Readonly<Record<string, string>>;
    waitUrgencyCurve: string;
    hardSeatLossCap: 1;
  };
  candidates: readonly WeightedSweepCandidate[];
  references: readonly WeightedReference[];
  paretoEfficientLabels: readonly string[];
  dominatedLabels: readonly string[];
  seedReplays: readonly WeightedSeedReplay[];
};

export function runWeightedSweep(
  runs = 100,
  seedStart = 1,
  onProgress?: (completed: number, total: number) => void,
): WeightedSweepResult {
  const specs: Array<{
    kind: 'control' | 'weighted';
    label: string;
    strategy: MatchmakingStrategy;
    profile?: WeightedProfile;
  }> = [
    {
      kind: 'control',
      label: 'Frozen queue-v2 grace',
      strategy: createFrozenQueueV2GraceStrategy(),
    },
    ...WEIGHTED_PROFILES.map((profile) => ({
      kind: 'weighted' as const,
      label: profile.label,
      strategy: createWeightedStrategy(profile),
      profile,
    })),
  ];
  const total = specs.length * SCENARIOS.length * runs;
  let completedBeforeCandidate = 0;
  const candidates = specs.map((spec) => {
    const benchmark = benchmarkSuite({
      runs,
      seedStart,
      strategy: spec.strategy,
      randomizationMode: 'paired-v1',
      onProgress: (completed) =>
        onProgress?.(completedBeforeCandidate + completed, total),
    });
    completedBeforeCandidate += SCENARIOS.length * runs;
    const scenarios = Object.fromEntries(
      SCENARIOS.map((scenario) => {
        const records = benchmark.records.filter(
          (record) => record.scenarioId === scenario.id,
        );
        return [scenario.id, metricSet(records)];
      }),
    );
    return {
      kind: spec.kind,
      label: spec.label,
      strategyId: benchmark.strategyId,
      ...(spec.profile ? { profile: spec.profile } : {}),
      global: metricSet(benchmark.records),
      scenarios,
    };
  });
  const efficient = paretoEfficient(candidates);
  const efficientLabels = new Set(efficient.map((candidate) => candidate.label));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      experiment: '2c-explainable-weighted-assignment',
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      randomizationMode: 'paired-v1',
      replayRandomizationMode: 'legacy',
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      candidateGeneration:
        'Frozen control plus one complete frozen-grace rematch for each seated multi-pool participant and each other explicitly accepted pool. Candidates are complete match sets; duplicates, unseated forced assignments, and alternatives below control minus one seat are discarded. At most one forced assignment is selected.',
      complexityBound:
        'At most 1 + M(P-1) matcher evaluations per queue decision, where M is the number of seated multi-pool participants and P is their maximum accepted-pool count: O(MP × C_match), not exponential.',
      scoreDefinitions: {
        immediateSeating:
          'candidate seated participants / maximum seated participants among considered alternatives',
        waitingUrgency:
          'mean piecewise-linear bounded urgency of every participant seated by the candidate',
        exclusiveUnlock:
          'newly seated exclusive participants in the forced target pod / target pod size',
        scarcity:
          'mean replaceability of seated multi-pool participants; 1 when the pool cannot form a legal pod without the participant but can with them, otherwise 1/(1+compatible substitutes)',
        preference:
          'candidate seats assigned to each participant preferred pool / candidate seats',
      },
      waitUrgencyCurve:
        'Piecewise linear: 0m=0, 5m=0.10, 10m=0.25, 20m=0.50, 30m=0.75, 60m+=1.00.',
      hardSeatLossCap: 1,
    },
    candidates,
    references: loadReferences(runs, seedStart),
    paretoEfficientLabels: efficient.map((candidate) => candidate.label),
    dominatedLabels: candidates
      .filter((candidate) => !efficientLabels.has(candidate.label))
      .map((candidate) => candidate.label),
    seedReplays: runKnownSeedReplays(),
  };
}

export function writeWeightedSweep(
  result: WeightedSweepResult,
  path = WEIGHTED_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

function metricSet(records: readonly EventMetricRecord[]): WeightedMetricSet {
  return {
    existing: aggregateGraceSweepRecords(records, 0),
    scarcity: aggregateScarcityMetrics(records),
    starvation: aggregateStarvationMetrics(records),
    weighted: aggregateWeightedDecisions(records),
  };
}

function loadReferences(
  runs: number,
  seedStart: number,
): WeightedReference[] {
  const artifact = JSON.parse(
    readFileSync(WEIGHTED_REFERENCE_PATH, 'utf8'),
  ) as SeatLossSweepResult;
  if (
    artifact.metadata.suiteVersion !== SCENARIO_SUITE_VERSION ||
    artifact.metadata.runsPerScenario !== runs ||
    artifact.metadata.seedStart !== seedStart ||
    artifact.metadata.randomizationMode !== 'paired-v1'
  ) {
    throw new Error(
      `Experiment 2B reference artifact is incompatible: ${WEIGHTED_REFERENCE_PATH}`,
    );
  }
  const reference = (
    maxLoss: 0 | 1,
    threshold: number | null,
    label: WeightedReference['label'],
  ): WeightedReference => {
    const candidate = artifact.candidates.find(
      (entry) =>
        entry.maxImmediateSeatLoss === maxLoss &&
        entry.starvationThresholdSeconds === threshold,
    );
    if (!candidate) {
      throw new Error(`Missing compatible reference ${label}.`);
    }
    return {
      label,
      sourcePath: WEIGHTED_REFERENCE_PATH,
      global: candidate.global,
      scenarios: candidate.scenarios,
    };
  };
  return [
    reference(0, null, 'Experiment 2A zero-seat-loss'),
    reference(1, 600, 'Experiment 2B 600s'),
    reference(1, 1_200, 'Experiment 2B 1200s'),
  ];
}

function runKnownSeedReplays(): WeightedSeedReplay[] {
  const out: WeightedSeedReplay[] = [];
  for (const [scenarioId, seeds] of Object.entries(
    WEIGHTED_REPLAY_SEEDS,
  ) as Array<
    [
      keyof typeof WEIGHTED_REPLAY_SEEDS,
      readonly number[],
    ]
  >) {
    for (const seed of seeds) {
      const control = runSimulation(getScenario(scenarioId), {
        seed,
        strategy: createFrozenQueueV2GraceStrategy(),
        randomizationMode: 'legacy',
      });
      const profiles = WEIGHTED_PROFILES.map((profile) => {
        const result = runSimulation(getScenario(scenarioId), {
          seed,
          strategy: createWeightedStrategy(profile),
          randomizationMode: 'legacy',
        });
        const changed = (result.record.weightedDecisions ?? []).filter(
          (decision) => decision.changedFromControl,
        );
        const considered = result.record.weightedDecisions ?? [];
        const participantById = new Map(
          result.record.participants.map((participant) => [
            participant.id,
            participant,
          ]),
        );
        const b4Cycles = result.record.queueCycles
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
            startedAt: cycle.startedAt,
            endedAt: cycle.endedAt,
          }))
          .sort(
            (left, right) =>
              right.waitSeconds - left.waitSeconds ||
              left.participantId.localeCompare(right.participantId),
          )
          .slice(0, 5);
        return {
          profileId: profile.id,
          label: profile.label,
          games: result.record.games.length,
          playedParticipants: playedCount(result.record),
          scoredDecisionCount: considered.length,
          changedDecisionCount: changed.length,
          consideredDecisions: considered,
          changedDecisions: changed,
          longestB4ExclusiveCycles: b4Cycles,
        };
      });
      out.push({
        scenarioId,
        seed,
        randomizationMode: 'legacy',
        frozenControl: {
          games: control.record.games.length,
          playedParticipants: playedCount(control.record),
        },
        profiles,
      });
    }
  }
  return out;
}

function playedCount(record: EventMetricRecord): number {
  return new Set(
    record.games.flatMap((game) =>
      game.seats.map((seat) => seat.participantId),
    ),
  ).size;
}

function paretoEfficient(
  candidates: readonly WeightedSweepCandidate[],
): WeightedSweepCandidate[] {
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) => other !== candidate && dominates(other, candidate),
      ),
  );
}

function dominates(
  left: WeightedSweepCandidate,
  right: WeightedSweepCandidate,
): boolean {
  const leftValues = objectives(left);
  const rightValues = objectives(right);
  return (
    leftValues.every((value, index) => value <= (rightValues[index] ?? 0)) &&
    leftValues.some((value, index) => value < (rightValues[index] ?? 0))
  );
}

function objectives(candidate: WeightedSweepCandidate): number[] {
  const metric = candidate.global;
  return [
    -metric.existing.gamesPerAttendee,
    metric.starvation.all.neverMatched.rate,
    metric.starvation.worstExclusivePool.over30Minutes.rate,
    metric.starvation.worstExclusivePool.over60Minutes.rate,
    metric.starvation.worstExclusivePool.neverMatched.rate,
    -metric.existing.assignment.preferredPool.rate,
  ];
}
