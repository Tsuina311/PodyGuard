import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_ARTIFACT_DIRECTORY } from './artifacts.js';
import { benchmarkSuite } from './benchmark.js';
import { runSimulation, SIMULATION_ENGINE_VERSION } from './engine.js';
import {
  aggregateGraceSweepRecords,
  type GraceSweepMetricSummary,
} from './grace-sweep.js';
import {
  aggregateScarcityMetrics,
  type ScarcityMetricSummary,
} from './scarcity-metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION, getScenario } from './scenarios.js';
import {
  createFrozenQueueV2GraceStrategy,
  createQueueV2GraceDiagnosticControl,
  createQueueV2ScarcityExperimentalStrategy,
  type MatchmakingInput,
  type MatchmakingResult,
  type MatchmakingStrategy,
} from './strategy.js';

export const SCARCITY_WAIT_THRESHOLDS = [0, 120, 300, 600] as const;
export const SCARCITY_FOCUS_SCENARIOS = [
  'B4_STARVATION_30',
  'NORMAL_FRIDAY_40',
  'SMALL_EVENT_8',
  'LATE_ARRIVALS_40',
  'TABLE_SCARCITY_50',
  'LONG_GAMES_40',
] as const;
export const SCARCITY_REPLAY_SEEDS = {
  B4_STARVATION_30: [529, 637, 231],
  NORMAL_FRIDAY_40: [74, 629],
} as const;
export const SCARCITY_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-scarcity-experiment-2a.json',
);

export type ScarcitySweepCandidate = {
  label: string;
  thresholdSeconds: number | null;
  strategyId: string;
  global: {
    existing: GraceSweepMetricSummary;
    scarcity: ScarcityMetricSummary;
  };
  scenarios: Readonly<
    Record<
      string,
      {
        existing: GraceSweepMetricSummary;
        scarcity: ScarcityMetricSummary;
      }
    >
  >;
};

export type ScarcityReplayAssignment = {
  at: number;
  participantId: string;
  acceptedPoolIds: readonly string[];
  assignedPoolId: string;
  waitingB4Exclusive: ReadonlyArray<{
    participantId: string;
    waitSeconds: number;
  }>;
  b4CompatibleWithoutParticipant: number;
  b4AssignmentCouldFormLegalPod: boolean;
  chosenPoolAlternativeCount: number;
  physicalTablesAvailable: number;
};

export type ScarcitySeedReplay = {
  scenarioId: keyof typeof SCARCITY_REPLAY_SEEDS;
  seed: number;
  randomizationMode: 'legacy';
  controlAssignments: readonly ScarcityReplayAssignment[];
  candidates: ReadonlyArray<{
    label: string;
    reallocations: NonNullable<
      ReturnType<typeof runSimulation>['record']['scarcityDiagnostics']
    >;
    b4ExclusiveCycles: ReadonlyArray<{
      participantId: string;
      startedAt: number;
      endedAt: number;
      reason: string;
      waitSeconds: number;
    }>;
  }>;
};

export type ScarcitySweepResult = {
  schemaVersion: 1;
  generatedAt: string;
  metadata: {
    experiment: '2a-scarce-pool-unlock';
    suiteVersion: string;
    engineVersion: string;
    randomizationMode: 'paired-v1';
    replayRandomizationMode: 'legacy';
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    scenarioIds: readonly string[];
    thresholds: typeof SCARCITY_WAIT_THRESHOLDS;
    exactRule: string;
    missedOpportunityDefinition: string;
  };
  candidates: readonly ScarcitySweepCandidate[];
  paretoEfficientLabels: readonly string[];
  seedReplays: readonly ScarcitySeedReplay[];
};

export function runScarcitySweep(
  runs = 100,
  seedStart = 1,
  onProgress?: (completed: number, total: number) => void,
): ScarcitySweepResult {
  const specs = [
    {
      label: 'queue-v2-grace control',
      thresholdSeconds: null,
      strategy: createQueueV2GraceDiagnosticControl(),
    },
    ...SCARCITY_WAIT_THRESHOLDS.map((thresholdSeconds) => ({
      label: `scarcity threshold ${thresholdSeconds}s`,
      thresholdSeconds,
      strategy: createQueueV2ScarcityExperimentalStrategy(thresholdSeconds),
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
        return [
          scenario.id,
          {
            existing: aggregateGraceSweepRecords(records, 0),
            scarcity: aggregateScarcityMetrics(records),
          },
        ];
      }),
    );
    return {
      label: spec.label,
      thresholdSeconds: spec.thresholdSeconds,
      strategyId: benchmark.strategyId,
      global: {
        existing: aggregateGraceSweepRecords(benchmark.records, 0),
        scarcity: aggregateScarcityMetrics(benchmark.records),
      },
      scenarios,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      experiment: '2a-scarce-pool-unlock',
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      randomizationMode: 'paired-v1',
      replayRandomizationMode: 'legacy',
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      thresholds: SCARCITY_WAIT_THRESHOLDS,
      exactRule:
        'Consider one control-preferred multi-pool participant and one explicitly accepted secondary pool at a time. Without that participant the secondary pool cannot form any legal pod; with them it can. It must include an exclusive participant whose oldest wait meets the threshold and exceeds the oldest exclusive wait in the preferred pool, and have no more alternatives than the preferred pool. Force the accepted secondary assignment through the unchanged frozen 120s/600s grace strategy; use the best deterministic candidate only if it seats at least as many participants immediately.',
      missedOpportunityDefinition:
        'MISSED_SCARCE_POOL_UNLOCK is an eligible preferred-to-secondary redirect under the same structural and no-coverage-loss checks that the diagnostic-only frozen control did not take. It is analysis data, not a scoring weight.',
    },
    candidates,
    paretoEfficientLabels: paretoEfficient(candidates).map(
      (candidate) => candidate.label,
    ),
    seedReplays: runKnownSeedReplays(),
  };
}

export function writeScarcitySweep(
  result: ScarcitySweepResult,
  path = SCARCITY_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

function runKnownSeedReplays(): ScarcitySeedReplay[] {
  const out: ScarcitySeedReplay[] = [];
  for (const [scenarioId, seeds] of Object.entries(
    SCARCITY_REPLAY_SEEDS,
  ) as Array<
    [
      keyof typeof SCARCITY_REPLAY_SEEDS,
      readonly number[],
    ]
  >) {
    for (const seed of seeds) {
      const assignments: ScarcityReplayAssignment[] = [];
      const frozen = createFrozenQueueV2GraceStrategy();
      const observer: MatchmakingStrategy = {
        id: `${frozen.id}-replay-observer`,
        match(input) {
          const result = frozen.match(input);
          observeB4Assignments(input, result, assignments);
          return result;
        },
      };
      runSimulation(getScenario(scenarioId), {
        seed,
        strategy: observer,
        randomizationMode: 'legacy',
      });
      const candidateRuns = [
        {
          label: 'control',
          strategy: createQueueV2GraceDiagnosticControl(),
        },
        ...SCARCITY_WAIT_THRESHOLDS.map((threshold) => ({
          label: `threshold ${threshold}s`,
          strategy: createQueueV2ScarcityExperimentalStrategy(threshold),
        })),
      ].map(({ label, strategy }) => {
        const result = runSimulation(getScenario(scenarioId), {
          seed,
          strategy,
          randomizationMode: 'legacy',
        });
        const participantById = new Map(
          result.record.participants.map((participant) => [
            participant.id,
            participant,
          ]),
        );
        return {
          label,
          reallocations: result.record.scarcityDiagnostics ?? [],
          b4ExclusiveCycles: result.record.queueCycles
            .filter((cycle) => {
              const participant = participantById.get(cycle.participantId);
              return (
                participant?.acceptedPoolIds?.length === 1 &&
                participant.acceptedPoolIds[0] === 'B4'
              );
            })
            .map((cycle) => ({
              participantId: cycle.participantId,
              startedAt: cycle.startedAt,
              endedAt: cycle.endedAt,
              reason: cycle.reason,
              waitSeconds: cycle.endedAt - cycle.startedAt,
            })),
        };
      });
      out.push({
        scenarioId,
        seed,
        randomizationMode: 'legacy',
        controlAssignments: assignments,
        candidates: candidateRuns,
      });
    }
  }
  return out;
}

function observeB4Assignments(
  input: MatchmakingInput,
  result: MatchmakingResult,
  out: ScarcityReplayAssignment[],
): void {
  const seatByParticipant = new Map(
    result.matches.flatMap((match) =>
      match.seats.map((seat) => [seat.participantId, seat] as const),
    ),
  );
  for (const participant of input.participants) {
    const pools = [...new Set(participant.decks.map((deck) => deck.poolId))];
    const seat = seatByParticipant.get(participant.id);
    if (
      pools.length < 2 ||
      !pools.includes('B4') ||
      !seat ||
      seat.poolId === 'B4'
    ) {
      continue;
    }
    const b4Compatible = input.participants.filter(
      (entry) =>
        entry.id !== participant.id &&
        entry.decks.some((deck) => deck.poolId === 'B4'),
    );
    const b4Exclusive = b4Compatible.filter(
      (entry) =>
        new Set(entry.decks.map((deck) => deck.poolId)).size === 1,
    );
    if (b4Exclusive.length === 0) continue;
    out.push({
      at: input.now,
      participantId: participant.id,
      acceptedPoolIds: pools,
      assignedPoolId: seat.poolId,
      waitingB4Exclusive: b4Exclusive.map((entry) => ({
        participantId: entry.id,
        waitSeconds: input.now - entry.readyAt,
      })),
      b4CompatibleWithoutParticipant: b4Compatible.length,
      b4AssignmentCouldFormLegalPod: input.settings.allowedSizes.some(
        (size) => size <= b4Compatible.length + 1,
      ),
      chosenPoolAlternativeCount: input.participants.filter(
        (entry) =>
          entry.id !== participant.id &&
          entry.decks.some((deck) => deck.poolId === seat.poolId),
      ).length,
      physicalTablesAvailable: input.tables.length,
    });
  }
}

function paretoEfficient(
  candidates: readonly ScarcitySweepCandidate[],
): ScarcitySweepCandidate[] {
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other !== candidate &&
          dominates(other, candidate),
      ),
  );
}

function dominates(
  left: ScarcitySweepCandidate,
  right: ScarcitySweepCandidate,
): boolean {
  const leftValues = objectives(left);
  const rightValues = objectives(right);
  return (
    leftValues.every((value, index) => value <= (rightValues[index] ?? 0)) &&
    leftValues.some((value, index) => value < (rightValues[index] ?? 0))
  );
}

function objectives(candidate: ScarcitySweepCandidate): number[] {
  const global = candidate.global;
  return [
    global.existing.matchedWaitSeconds.p95,
    global.existing.matchedWaitSeconds.max,
    global.existing.neverMatched.rate,
    global.scarcity.b4Exclusive.matchedWait.p95,
    global.scarcity.b4Exclusive.matchedWait.max,
    global.scarcity.b4Exclusive.neverMatched.rate,
    global.existing.assignment.secondaryPool.rate,
    global.existing.immediateRematch.rate,
  ];
}
