import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_ARTIFACT_DIRECTORY } from './artifacts.js';
import { benchmarkSuite } from './benchmark.js';
import { runSimulation, SIMULATION_ENGINE_VERSION } from './engine.js';
import {
  aggregateGraceSweepRecords,
  type GraceSweepMetricSummary,
} from './grace-sweep.js';
import type {
  EventMetricRecord,
  MetricScarcityDiagnostic,
} from './metrics.js';
import {
  aggregateScarcityMetrics,
  type ScarcityMetricSummary,
} from './scarcity-metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION, getScenario } from './scenarios.js';
import {
  createQueueV2BoundedSeatLossStrategy,
  createQueueV2ScarcityExperimentalStrategy,
  type MatchmakingStrategy,
} from './strategy.js';
import {
  aggregateStarvationMetrics,
  type StarvationMetricSummary,
} from './starvation-metrics.js';

export const SEAT_LOSS_STARVATION_THRESHOLDS = [
  600,
  1_200,
  1_800,
  2_700,
] as const;
export const SEAT_LOSS_FOCUS_SCENARIOS = [
  'B4_STARVATION_30',
  'NORMAL_FRIDAY_40',
  'NORMAL_FRIDAY_20',
  'SMALL_EVENT_8',
  'LOW_REQUEUE_40',
  'TABLE_SCARCITY_50',
  'LONG_GAMES_40',
] as const;
export const SEAT_LOSS_REPLAY_SEEDS = {
  NORMAL_FRIDAY_40: [629, 74],
  B4_STARVATION_30: [529, 637, 231],
} as const;
export const SEAT_LOSS_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-scarcity-experiment-2b.json',
);

export type RescueEfficiency = {
  exclusiveParticipantsNewlySeatedPerImmediateSeatSacrificed: number;
  neverMatchedReductionPerOneSeatLossRedirect: number;
  exclusiveOver30MinuteWaitReductionPerOneSeatLossRedirect: number;
  eventuallyMatchedParticipantDelta: number;
  pairedExclusiveOutcomes: {
    observations: number;
    matchedLaterInControlTimeline: number;
    noLaterMatchInControlTimeline: number;
  };
};

export type SeatLossCandidateSummary = {
  label: string;
  maxImmediateSeatLoss: 0 | 1;
  starvationThresholdSeconds: number | null;
  strategyId: string;
  global: SeatLossMetricSet;
  scenarios: Readonly<Record<string, SeatLossMetricSet>>;
};

export type SeatLossMetricSet = {
  existing: GraceSweepMetricSummary;
  scarcity: ScarcityMetricSummary;
  starvation: StarvationMetricSummary;
  rescueEfficiency: RescueEfficiency;
};

export type SeatLossReplayDecision = {
  diagnostic: MetricScarcityDiagnostic;
  controlGameParticipantIds: readonly string[];
  alternateGameParticipantIds: readonly string[];
  displacedControlParticipants: ReadonlyArray<{
    participantId: string;
    eventuallyMatchedInCandidate: boolean;
    nextCandidateMatchAt: number | null;
    candidateWaitAfterDecisionSeconds: number | null;
  }>;
  exclusiveOutcomes: ReadonlyArray<{
    participantId: string;
    controlEventuallyMatchedAfterDecision: boolean;
    controlNextMatchAt: number | null;
    candidateMatchAt: number | null;
  }>;
};

export type SeatLossSeedReplay = {
  scenarioId: keyof typeof SEAT_LOSS_REPLAY_SEEDS;
  seed: number;
  randomizationMode: 'legacy';
  control: {
    games: number;
    playedParticipants: number;
    diagnostics: readonly MetricScarcityDiagnostic[];
  };
  candidates: ReadonlyArray<{
    label: string;
    games: number;
    playedParticipants: number;
    decisions: readonly SeatLossReplayDecision[];
    diagnostics: readonly MetricScarcityDiagnostic[];
  }>;
};

export type SeatLossSweepResult = {
  schemaVersion: 1;
  generatedAt: string;
  metadata: {
    experiment: '2b-bounded-one-seat-loss';
    suiteVersion: string;
    engineVersion: string;
    randomizationMode: 'paired-v1';
    replayRandomizationMode: 'legacy';
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    scenarioIds: readonly string[];
    thresholds: typeof SEAT_LOSS_STARVATION_THRESHOLDS;
    fullWaitDefinition: string;
    exactRule: string;
    tieBreak: string;
  };
  candidates: readonly SeatLossCandidateSummary[];
  paretoEfficientLabels: readonly string[];
  seedReplays: readonly SeatLossSeedReplay[];
};

export function runSeatLossSweep(
  runs = 100,
  seedStart = 1,
  onProgress?: (completed: number, total: number) => void,
): SeatLossSweepResult {
  const specs: Array<{
    label: string;
    maxImmediateSeatLoss: 0 | 1;
    starvationThresholdSeconds: number | null;
    strategy: MatchmakingStrategy;
  }> = [
    {
      label: 'seatLoss 0 control',
      maxImmediateSeatLoss: 0,
      starvationThresholdSeconds: null,
      strategy: createQueueV2ScarcityExperimentalStrategy(0),
    },
    ...SEAT_LOSS_STARVATION_THRESHOLDS.map((threshold) => ({
      label: `seatLoss 1 / threshold ${threshold}s`,
      maxImmediateSeatLoss: 1 as const,
      starvationThresholdSeconds: threshold,
      strategy: createQueueV2BoundedSeatLossStrategy(threshold),
    })),
  ];
  const total = specs.length * SCENARIOS.length * runs;
  let completedBeforeCandidate = 0;
  const benchmarks = specs.map((spec) => {
    const benchmark = benchmarkSuite({
      runs,
      seedStart,
      strategy: spec.strategy,
      randomizationMode: 'paired-v1',
      onProgress: (completed) =>
        onProgress?.(completedBeforeCandidate + completed, total),
    });
    completedBeforeCandidate += SCENARIOS.length * runs;
    return { spec, benchmark };
  });
  const controlRecords = benchmarks[0]!.benchmark.records;
  const candidates = benchmarks.map(({ spec, benchmark }) => {
    const scenarios = Object.fromEntries(
      SCENARIOS.map((scenario) => {
        const records = benchmark.records.filter(
          (record) => record.scenarioId === scenario.id,
        );
        const scenarioControl = controlRecords.filter(
          (record) => record.scenarioId === scenario.id,
        );
        return [
          scenario.id,
          metricSet(records, scenarioControl),
        ];
      }),
    );
    return {
      label: spec.label,
      maxImmediateSeatLoss: spec.maxImmediateSeatLoss,
      starvationThresholdSeconds: spec.starvationThresholdSeconds,
      strategyId: benchmark.strategyId,
      global: metricSet(benchmark.records, controlRecords),
      scenarios,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      experiment: '2b-bounded-one-seat-loss',
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      randomizationMode: 'paired-v1',
      replayRandomizationMode: 'legacy',
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      thresholds: SEAT_LOSS_STARVATION_THRESHOLDS,
      fullWaitDefinition:
        'Still-waiting percentages use every READY queue episode, including matched, paused, left, and event-closed cycles. The denominator is queue cycles, not matched cycles.',
      exactRule:
        'Begin with the Experiment 2A threshold-0 zero-seat-loss decision. Independently force one seated multi-pool participant into one other explicitly accepted pool through the unchanged frozen 120s/600s grace strategy. The target must be unable to form any legal pod without that participant, able to form one with them, contain an exclusive waiter at or above the starvation threshold, newly seat at least one such exclusive, leave at least one compatible control-pool alternative, and seat exactly one fewer participant than the current zero-loss control. Evaluate every alternative against the same control; apply at most one.',
      tieBreak:
        'Oldest exclusive wait descending, newly seated exclusive count descending, scarce-pool substitute count ascending, scarce pool ID ascending, participant ID ascending.',
    },
    candidates,
    paretoEfficientLabels: paretoEfficient(candidates).map(
      (candidate) => candidate.label,
    ),
    seedReplays: runKnownSeedReplays(),
  };
}

export function writeSeatLossSweep(
  result: SeatLossSweepResult,
  path = SEAT_LOSS_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

function metricSet(
  records: readonly EventMetricRecord[],
  controlRecords: readonly EventMetricRecord[],
): SeatLossMetricSet {
  const scarcity = aggregateScarcityMetrics(records);
  const starvation = aggregateStarvationMetrics(records);
  const controlStarvation = aggregateStarvationMetrics(controlRecords);
  const redirects = scarcity.diagnostics.oneSeatLossRedirects;
  const sacrificed =
    scarcity.diagnostics.totalImmediateSeatsSacrificed;
  const pairedExclusiveOutcomes = compareExclusiveOutcomes(
    records,
    controlRecords,
  );
  return {
    existing: aggregateGraceSweepRecords(records, 0),
    scarcity,
    starvation,
    rescueEfficiency: {
      exclusiveParticipantsNewlySeatedPerImmediateSeatSacrificed: divide(
        scarcity.diagnostics
          .exclusiveParticipantsNewlySeatedThroughSeatLoss,
        sacrificed,
      ),
      neverMatchedReductionPerOneSeatLossRedirect: divide(
        controlStarvation.all.neverMatched.count -
          starvation.all.neverMatched.count,
        redirects,
      ),
      exclusiveOver30MinuteWaitReductionPerOneSeatLossRedirect: divide(
        exclusiveOverThreshold(controlStarvation, 1_800) -
          exclusiveOverThreshold(starvation, 1_800),
        redirects,
      ),
      eventuallyMatchedParticipantDelta:
        starvation.all.eventuallyMatched.count -
        controlStarvation.all.eventuallyMatched.count,
      pairedExclusiveOutcomes,
    },
  };
}

function compareExclusiveOutcomes(
  records: readonly EventMetricRecord[],
  controlRecords: readonly EventMetricRecord[],
): RescueEfficiency['pairedExclusiveOutcomes'] {
  const controlByNight = new Map(
    controlRecords.map((record) => [
      `${record.scenarioId}\0${record.seed}`,
      record,
    ]),
  );
  let observations = 0;
  let matchedLaterInControlTimeline = 0;
  for (const record of records) {
    const control = controlByNight.get(
      `${record.scenarioId}\0${record.seed}`,
    );
    if (!control) continue;
    for (const diagnostic of record.scarcityDiagnostics ?? []) {
      if (
        diagnostic.type !==
        'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION'
      ) {
        continue;
      }
      for (const participantId of
        diagnostic.newlySeatedExclusiveParticipantIds ?? []) {
        observations += 1;
        if (
          control.games.some(
            (game) =>
              game.startedAt > diagnostic.at &&
              game.seats.some(
                (seat) => seat.participantId === participantId,
              ),
          )
        ) {
          matchedLaterInControlTimeline += 1;
        }
      }
    }
  }
  return {
    observations,
    matchedLaterInControlTimeline,
    noLaterMatchInControlTimeline:
      observations - matchedLaterInControlTimeline,
  };
}

function exclusiveOverThreshold(
  summary: StarvationMetricSummary,
  threshold: number,
): number {
  return (['B2', 'B3', 'B4'] as const).reduce(
    (sum, poolId) =>
      sum +
      (summary.exclusivePools[poolId].fullWaitSeconds.overThreshold[
        String(threshold)
      ] ?? 0),
    0,
  );
}

function runKnownSeedReplays(): SeatLossSeedReplay[] {
  const out: SeatLossSeedReplay[] = [];
  for (const [scenarioId, seeds] of Object.entries(
    SEAT_LOSS_REPLAY_SEEDS,
  ) as Array<
    [
      keyof typeof SEAT_LOSS_REPLAY_SEEDS,
      readonly number[],
    ]
  >) {
    for (const seed of seeds) {
      const controlResult = runSimulation(getScenario(scenarioId), {
        seed,
        strategy: createQueueV2ScarcityExperimentalStrategy(0),
        randomizationMode: 'legacy',
      });
      const candidates = SEAT_LOSS_STARVATION_THRESHOLDS.map((threshold) => {
        const result = runSimulation(getScenario(scenarioId), {
          seed,
          strategy: createQueueV2BoundedSeatLossStrategy(threshold),
          randomizationMode: 'legacy',
        });
        const seatLossDiagnostics = (
          result.record.scarcityDiagnostics ?? []
        ).filter(
          (diagnostic) =>
            diagnostic.type ===
            'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION',
        );
        return {
          label: `threshold ${threshold}s`,
          games: result.record.games.length,
          playedParticipants: playedCount(result.record),
          decisions: seatLossDiagnostics.map((diagnostic) =>
            replayDecision(
              diagnostic,
              controlResult.record,
              result.record,
            ),
          ),
          diagnostics: result.record.scarcityDiagnostics ?? [],
        };
      });
      out.push({
        scenarioId,
        seed,
        randomizationMode: 'legacy',
        control: {
          games: controlResult.record.games.length,
          playedParticipants: playedCount(controlResult.record),
          diagnostics: controlResult.record.scarcityDiagnostics ?? [],
        },
        candidates,
      });
    }
  }
  return out;
}

function replayDecision(
  diagnostic: MetricScarcityDiagnostic,
  control: EventMetricRecord,
  candidate: EventMetricRecord,
): SeatLossReplayDecision {
  const controlGame = control.games.find(
    (game) =>
      game.startedAt === diagnostic.at &&
      game.poolId === diagnostic.controlPoolId &&
      game.seats.some(
        (seat) => seat.participantId === diagnostic.participantId,
      ),
  );
  const alternateGame = candidate.games.find(
    (game) =>
      game.startedAt === diagnostic.at &&
      game.poolId === diagnostic.scarcePoolId &&
      game.seats.some(
        (seat) => seat.participantId === diagnostic.participantId,
      ),
  );
  const alternateIds = new Set(
    candidate.games
      .filter((game) => game.startedAt === diagnostic.at)
      .flatMap((game) => game.seats.map((seat) => seat.participantId)),
  );
  const displaced = (controlGame?.seats ?? [])
    .map((seat) => seat.participantId)
    .filter((participantId) => !alternateIds.has(participantId));
  return {
    diagnostic,
    controlGameParticipantIds:
      controlGame?.seats.map((seat) => seat.participantId) ?? [],
    alternateGameParticipantIds:
      alternateGame?.seats.map((seat) => seat.participantId) ?? [],
    displacedControlParticipants: displaced.map((participantId) => {
      const nextCycle = candidate.queueCycles
        .filter(
          (cycle) =>
            cycle.participantId === participantId &&
            cycle.endedAt >= diagnostic.at,
        )
        .sort((left, right) => left.endedAt - right.endedAt)[0];
      const nextMatch = candidate.games
        .filter(
          (game) =>
            game.startedAt > diagnostic.at &&
            game.seats.some((seat) => seat.participantId === participantId),
        )
        .sort((left, right) => left.startedAt - right.startedAt)[0];
      return {
        participantId,
        eventuallyMatchedInCandidate: candidate.games.some((game) =>
          game.seats.some((seat) => seat.participantId === participantId),
        ),
        nextCandidateMatchAt: nextMatch?.startedAt ?? null,
        candidateWaitAfterDecisionSeconds: nextCycle
          ? nextCycle.endedAt - Math.max(nextCycle.startedAt, diagnostic.at)
          : null,
      };
    }),
    exclusiveOutcomes: (
      diagnostic.newlySeatedExclusiveParticipantIds ?? []
    ).map((participantId) => {
      const controlNext = control.games
        .filter(
          (game) =>
            game.startedAt > diagnostic.at &&
            game.seats.some((seat) => seat.participantId === participantId),
        )
        .sort((left, right) => left.startedAt - right.startedAt)[0];
      const candidateMatch = candidate.games.find(
        (game) =>
          game.startedAt >= diagnostic.at &&
          game.seats.some((seat) => seat.participantId === participantId),
      );
      return {
        participantId,
        controlEventuallyMatchedAfterDecision: controlNext !== undefined,
        controlNextMatchAt: controlNext?.startedAt ?? null,
        candidateMatchAt: candidateMatch?.startedAt ?? null,
      };
    }),
  };
}

function playedCount(record: EventMetricRecord): number {
  return new Set(
    record.games.flatMap((game) =>
      game.seats.map((seat) => seat.participantId),
    ),
  ).size;
}

function paretoEfficient(
  candidates: readonly SeatLossCandidateSummary[],
): SeatLossCandidateSummary[] {
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) => other !== candidate && dominates(other, candidate),
      ),
  );
}

function dominates(
  left: SeatLossCandidateSummary,
  right: SeatLossCandidateSummary,
): boolean {
  const leftValues = objectives(left);
  const rightValues = objectives(right);
  return (
    leftValues.every((value, index) => value <= (rightValues[index] ?? 0)) &&
    leftValues.some((value, index) => value < (rightValues[index] ?? 0))
  );
}

function objectives(candidate: SeatLossCandidateSummary): number[] {
  const metric = candidate.global;
  return [
    metric.starvation.worstExclusivePool.over30Minutes.rate,
    metric.starvation.worstExclusivePool.over60Minutes.rate,
    metric.starvation.worstExclusivePool.neverMatched.rate,
    metric.starvation.all.neverMatched.rate,
    -metric.existing.gamesPerAttendee,
    metric.existing.matchedWaitSeconds.p95,
    metric.scarcity.diagnostics.totalImmediateSeatsSacrificed,
  ];
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
