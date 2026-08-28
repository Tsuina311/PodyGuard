import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_ARTIFACT_DIRECTORY } from './artifacts.js';
import { benchmarkSuite } from './benchmark.js';
import { runSimulation, SIMULATION_ENGINE_VERSION } from './engine.js';
import {
  aggregateGraceSweepRecords,
  GRACE_SWEEP_SCENARIOS,
  type GraceSweepMetricSummary,
} from './grace-sweep.js';
import type { EventMetricRecord } from './metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION, getScenario } from './scenarios.js';
import {
  createQueueV2ExperimentalStrategy,
  createQueueV2OpportunityGraceStrategy,
  legacyV1Strategy,
  UNLIMITED_EXISTING_WAIT,
  type MatchmakingStrategy,
} from './strategy.js';

export const OPPORTUNITY_GRACE_SECONDS = [30, 60, 90, 120] as const;
export const OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS = [120, 300, 600, 'unlimited'] as const;
export const OLDEST_READY_CONTROL_GRACE_SECONDS = [30, 60, 90, 120] as const;
export const CATASTROPHIC_SMALL_EVENT_SEEDS = [174, 510, 299] as const;
export const OPPORTUNITY_GRACE_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-opportunity-grace-sweep.json',
);

export type OpportunityClock = 'legacy' | 'oldest-ready' | 'opportunity';
export type MaxExistingWait = (typeof OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS)[number];

export type OpportunityGraceSweepOptions = {
  runs?: number;
  seedStart?: number;
  onProgress?: (completed: number, total: number) => void;
};

export type OpportunityGraceCandidateSpec = {
  clock: OpportunityClock;
  graceSeconds: number;
  maxExistingWaitSeconds: number | null;
  label: string;
  strategyId: string;
  reproductionCommand: string;
};

export type OpportunityGraceCandidate = OpportunityGraceCandidateSpec & {
  global: GraceSweepMetricSummary;
  scenarios: Readonly<Record<(typeof GRACE_SWEEP_SCENARIOS)[number], GraceSweepMetricSummary>>;
};

export type CatastrophicSeedReplay = {
  seed: number;
  legacy: {
    firstPodSize: number | null;
    firstPodStartedAt: number | null;
    poolId: string | null;
    trioIds: readonly string[];
    fourthId: string | null;
    fourthReadyAt: number | null;
    fourthMatchedAt: number | null;
    capturedFourth: boolean;
  };
  candidates: ReadonlyArray<{
    label: string;
    firstPodSize: number | null;
    firstPodStartedAt: number | null;
    fourthMatchedAt: number | null;
    capturedFourth: boolean;
  }>;
};

export type OpportunityGraceSweepResult = {
  schemaVersion: 1;
  generatedAt: string;
  metadata: {
    suiteVersion: string;
    engineVersion: string;
    experiment: '1b-opportunity-grace';
    randomizationMode: 'paired-v1';
    catastrophicReplayRandomizationMode: 'legacy';
    graceSeconds: typeof OPPORTUNITY_GRACE_SECONDS;
    maxExistingWaitSeconds: typeof OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS;
    oldestReadyControlGraceSeconds: typeof OLDEST_READY_CONTROL_GRACE_SECONDS;
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    scenarioIds: readonly string[];
    reportedScenarioIds: typeof GRACE_SWEEP_SCENARIOS;
    catastrophicSeeds: typeof CATASTROPHIC_SMALL_EVENT_SEEDS;
  };
  candidates: readonly OpportunityGraceCandidate[];
  paretoEfficientLabels: readonly string[];
  opportunityOnlyParetoLabels: readonly string[];
  catastrophicReplays: readonly CatastrophicSeedReplay[];
};

export function opportunityGraceCandidateSpecs(
  runs: number,
  seedStart: number,
): OpportunityGraceCandidateSpec[] {
  const specs: OpportunityGraceCandidateSpec[] = [
    spec('legacy', 0, null, runs, seedStart),
    ...OLDEST_READY_CONTROL_GRACE_SECONDS.map((graceSeconds) =>
      spec('oldest-ready', graceSeconds, null, runs, seedStart),
    ),
  ];
  for (const graceSeconds of OPPORTUNITY_GRACE_SECONDS) {
    for (const maxExistingWait of OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS) {
      specs.push(
        spec(
          'opportunity',
          graceSeconds,
          maxExistingWait === 'unlimited' ? null : maxExistingWait,
          runs,
          seedStart,
        ),
      );
    }
  }
  return specs;
}

export function createOpportunityGraceStrategy(
  spec: Pick<OpportunityGraceCandidateSpec, 'clock' | 'graceSeconds' | 'maxExistingWaitSeconds'>,
): MatchmakingStrategy {
  if (spec.clock === 'legacy' || spec.graceSeconds <= 0) return legacyV1Strategy;
  if (spec.clock === 'oldest-ready') {
    return createQueueV2ExperimentalStrategy(spec.graceSeconds);
  }
  return createQueueV2OpportunityGraceStrategy(
    spec.graceSeconds,
    spec.maxExistingWaitSeconds ?? UNLIMITED_EXISTING_WAIT,
  );
}

export function runOpportunityGraceSweep(
  options: OpportunityGraceSweepOptions = {},
): OpportunityGraceSweepResult {
  const runs = options.runs ?? 100;
  const seedStart = options.seedStart ?? 1;
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new Error(`Sweep runs must be a positive safe integer, received ${runs}.`);
  }
  if (!Number.isSafeInteger(seedStart)) {
    throw new Error(`Sweep seed start must be a safe integer, received ${seedStart}.`);
  }
  const specs = opportunityGraceCandidateSpecs(runs, seedStart);
  const total = specs.length * SCENARIOS.length * runs;
  let completedBeforeCandidate = 0;
  const candidates = specs.map((candidateSpec) => {
    const benchmark = benchmarkSuite({
      runs,
      seedStart,
      strategy: createOpportunityGraceStrategy(candidateSpec),
      randomizationMode: 'paired-v1',
      onProgress: (completed) => options.onProgress?.(completedBeforeCandidate + completed, total),
    });
    completedBeforeCandidate += SCENARIOS.length * runs;
    const runtimeByNight = new Map(
      benchmark.nights.map((night) => [`${night.scenarioId}\0${night.seed}`, night.runtimeMs]),
    );
    const runtimeFor = (records: readonly EventMetricRecord[]): number =>
      records.reduce(
        (sum, record) => sum + (runtimeByNight.get(`${record.scenarioId}\0${record.seed}`) ?? 0),
        0,
      );
    const scenarios = Object.fromEntries(
      GRACE_SWEEP_SCENARIOS.map((scenarioId) => {
        const records = benchmark.records.filter((record) => record.scenarioId === scenarioId);
        return [scenarioId, aggregateGraceSweepRecords(records, runtimeFor(records))];
      }),
    ) as OpportunityGraceCandidate['scenarios'];
    return {
      ...candidateSpec,
      strategyId: benchmark.strategyId,
      global: aggregateGraceSweepRecords(benchmark.records, runtimeFor(benchmark.records)),
      scenarios,
    };
  });

  const opportunityOnly = candidates.filter((candidate) => candidate.clock === 'opportunity');
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      experiment: '1b-opportunity-grace',
      randomizationMode: 'paired-v1',
      catastrophicReplayRandomizationMode: 'legacy',
      graceSeconds: OPPORTUNITY_GRACE_SECONDS,
      maxExistingWaitSeconds: OPPORTUNITY_MAX_EXISTING_WAIT_SECONDS,
      oldestReadyControlGraceSeconds: OLDEST_READY_CONTROL_GRACE_SECONDS,
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      reportedScenarioIds: GRACE_SWEEP_SCENARIOS,
      catastrophicSeeds: CATASTROPHIC_SMALL_EVENT_SEEDS,
    },
    candidates,
    paretoEfficientLabels: paretoLabels(candidates),
    opportunityOnlyParetoLabels: paretoLabels(opportunityOnly),
    catastrophicReplays: replayCatastrophicSeeds(specs),
  };
}

export function replayCatastrophicSeeds(
  specs: readonly OpportunityGraceCandidateSpec[],
): CatastrophicSeedReplay[] {
  const scenario = getScenario('SMALL_EVENT_8');
  return CATASTROPHIC_SMALL_EVENT_SEEDS.map((seed) => {
    const legacyResult = runSimulation(scenario, {
      seed,
      strategy: legacyV1Strategy,
      randomizationMode: 'legacy',
    });
    const legacyCapture = captureAnalysis(legacyResult.record);
    return {
      seed,
      legacy: legacyCapture,
      candidates: specs.map((candidateSpec) => {
        const result = runSimulation(scenario, {
          seed,
          strategy: createOpportunityGraceStrategy(candidateSpec),
          randomizationMode: 'legacy',
        });
        const capture = captureAnalysis(result.record, legacyCapture);
        return {
          label: candidateSpec.label,
          firstPodSize: capture.firstPodSize,
          firstPodStartedAt: capture.firstPodStartedAt,
          fourthMatchedAt: capture.fourthMatchedAt,
          capturedFourth: capture.capturedFourth,
        };
      }),
    };
  });
}

export function writeOpportunityGraceSweep(
  result: OpportunityGraceSweepResult,
  path = OPPORTUNITY_GRACE_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

export function formatOpportunityGraceSweepReport(result: OpportunityGraceSweepResult): string {
  const pareto = new Set(result.paretoEfficientLabels);
  const opportunityPareto = new Set(result.opportunityOnlyParetoLabels);
  const lines = [
    `Queue v2 Experiment 1B opportunity-grace sweep · paired-v1 · ${result.metadata.runsPerScenario} runs/scenario · ${result.metadata.scenarioIds.length} scenarios`,
    `Pareto-efficient (all candidates): ${result.paretoEfficientLabels.join(', ') || '(none)'}`,
    `Pareto-efficient (opportunity-clock only): ${result.opportunityOnlyParetoLabels.join(', ') || '(none)'}`,
    'This experiment does not address thin-pool / B4 starvation.',
  ];
  const scopes: ReadonlyArray<
    readonly [string, (candidate: OpportunityGraceCandidate) => GraceSweepMetricSummary]
  > = [
    ['GLOBAL', (candidate) => candidate.global],
    ...GRACE_SWEEP_SCENARIOS.map((scenarioId) =>
      [scenarioId, (candidate: OpportunityGraceCandidate) => candidate.scenarios[scenarioId]] as const),
  ];
  for (const [label, select] of scopes) {
    lines.push('', label);
    lines.push(table(
      ['candidate', 'median', 'p95', 'max', '>5m', 'never', 'pod 3', 'pod 4', 'pod 5'],
      result.candidates.map((candidate) => {
        const value = select(candidate);
        const mark = label === 'GLOBAL' && pareto.has(candidate.label)
          ? '*'
          : label === 'GLOBAL' && opportunityPareto.has(candidate.label)
            ? '†'
            : '';
        return [
          `${candidate.label}${mark}`,
          duration(value.matchedWaitSeconds.median),
          duration(value.matchedWaitSeconds.p95),
          duration(value.matchedWaitSeconds.max),
          countRate(value.matchedWaitSeconds.overMinutes['5']),
          countRate(value.neverMatched),
          countRate(value.pods.sizes['3']),
          countRate(value.pods.sizes['4']),
          countRate(value.pods.sizes['5']),
        ];
      }),
    ));
    if (label === 'SMALL_EVENT_8') {
      lines.push(table(
        ['candidate', 'avg matched/event', 'never matched', 'nights w/ 4-pod', 'only 3-pods', 'p95', 'max'],
        result.candidates.map((candidate) => {
          const value = select(candidate);
          return [
            candidate.label,
            value.eventComposition.averageMatchedPlayers.toFixed(3),
            countRate(value.neverMatched),
            countRate(value.eventComposition.nightsWithFourPod),
            countRate(value.eventComposition.nightsWithOnlyThreePods),
            duration(value.matchedWaitSeconds.p95),
            duration(value.matchedWaitSeconds.max),
          ];
        }),
      ));
    }
    if (label === 'NORMAL_FRIDAY_40') {
      lines.push(table(
        ['candidate', 'median', 'p95', 'never matched', 'pod 3', 'pod 4', 'pod 5'],
        result.candidates.map((candidate) => {
          const value = select(candidate);
          return [
            candidate.label,
            duration(value.matchedWaitSeconds.median),
            duration(value.matchedWaitSeconds.p95),
            countRate(value.neverMatched),
            countRate(value.pods.sizes['3']),
            countRate(value.pods.sizes['4']),
            countRate(value.pods.sizes['5']),
          ];
        }),
      ));
    }
    if (label === 'B4_STARVATION_30') {
      lines.push(
        'B4_STARVATION_30 is reported only to confirm Experiment 1B does not solve thin-pool starvation.',
      );
    }
  }
  lines.push('', 'CATASTROPHIC SMALL_EVENT_8 SEEDS (legacy randomization, matching the original diagnosis)');
  for (const replay of result.catastrophicReplays) {
    lines.push(
      '',
      `seed ${replay.seed}: legacy first pod ${formatPod(replay.legacy)} pool=${replay.legacy.poolId ?? 'none'} fourth=${replay.legacy.fourthId ?? 'none'} captured=${replay.legacy.capturedFourth}`,
    );
    lines.push(table(
      ['candidate', 'first pod', 'fourth matched', 'captured fourth'],
      replay.candidates.map((candidate) => [
        candidate.label,
        formatPod(candidate),
        candidate.fourthMatchedAt === null ? '—' : `${candidate.fourthMatchedAt}s`,
        candidate.capturedFourth ? 'yes' : 'no',
      ]),
    ));
  }
  lines.push(
    '',
    '* Pareto-efficient across the full candidate set (legacy + oldest-ready + opportunity).',
    '† Pareto-efficient among opportunity-clock candidates only.',
    'No winner is selected.',
  );
  return lines.join('\n');
}

function spec(
  clock: OpportunityClock,
  graceSeconds: number,
  maxExistingWaitSeconds: number | null,
  runs: number,
  seedStart: number,
): OpportunityGraceCandidateSpec {
  const waitLabel =
    clock !== 'opportunity'
      ? 'n/a'
      : maxExistingWaitSeconds === null
        ? 'unlimited'
        : `${maxExistingWaitSeconds}s`;
  const label =
    clock === 'legacy'
      ? 'legacy-v1'
      : clock === 'oldest-ready'
        ? `oldest-ready ${graceSeconds}s`
        : `opportunity ${graceSeconds}s / max-wait ${waitLabel}`;
  const strategy = createOpportunityGraceStrategy({
    clock,
    graceSeconds,
    maxExistingWaitSeconds,
  });
  const waitFlag =
    clock === 'opportunity'
      ? ` --max-existing-wait ${maxExistingWaitSeconds === null ? 'unlimited' : maxExistingWaitSeconds}`
      : '';
  const strategyName =
    clock === 'opportunity' ? 'queue-v2-opportunity-grace' : clock === 'oldest-ready'
      ? 'queue-v2-experimental'
      : 'legacy-v1';
  return {
    clock,
    graceSeconds,
    maxExistingWaitSeconds,
    label,
    strategyId: strategy.id,
    reproductionCommand:
      `yarn simulation:benchmark --runs ${runs} --seed-start ${seedStart} ` +
      `--strategy ${strategyName} --grace ${graceSeconds}${waitFlag} ` +
      `--randomization paired-v1`,
  };
}

function captureAnalysis(
  record: EventMetricRecord,
  legacy?: CatastrophicSeedReplay['legacy'],
): CatastrophicSeedReplay['legacy'] {
  const games = [...record.games].sort((left, right) => left.startedAt - right.startedAt);
  const first = games[0];
  const poolId = legacy?.poolId ?? first?.poolId ?? null;
  const poolGames = games.filter((game) => game.poolId === poolId);
  const firstPoolGame = poolGames[0];
  const trioIds = legacy?.trioIds ?? firstPoolGame?.seats.map((seat) => seat.participantId) ?? [];
  const trioSet = new Set(trioIds);
  const fourthId =
    legacy?.fourthId ??
    poolGames
      .flatMap((game) => game.seats.map((seat) => seat.participantId))
      .find((id) => !trioSet.has(id)) ??
    null;
  const fourthMatchedAt =
    fourthId === null
      ? null
      : games.find((game) => game.seats.some((seat) => seat.participantId === fourthId))?.startedAt ??
        null;
  const capturedFourth =
    fourthId !== null &&
    poolGames.some((game) =>
      game.seats.length === 4 &&
      game.seats.some((seat) => seat.participantId === fourthId) &&
      game.seats.filter((seat) => trioSet.has(seat.participantId)).length >= 2,
    );
  const fourthReadyAt =
    fourthId === null
      ? null
      : record.queueCycles.find((cycle) => cycle.participantId === fourthId)?.startedAt ?? null;
  return {
    firstPodSize: firstPoolGame?.seats.length ?? null,
    firstPodStartedAt: firstPoolGame?.startedAt ?? null,
    poolId,
    trioIds,
    fourthId,
    fourthReadyAt,
    fourthMatchedAt,
    capturedFourth,
  };
}

function paretoLabels(candidates: readonly OpportunityGraceCandidate[]): string[] {
  return candidates
    .filter((candidate, index) =>
      !candidates.some((other, otherIndex) =>
        otherIndex !== index && dominates(other.global, candidate.global),
      ),
    )
    .map((candidate) => candidate.label);
}

function dominates(
  candidate: GraceSweepMetricSummary,
  other: GraceSweepMetricSummary,
): boolean {
  const candidateObjectives = [
    candidate.matchedWaitSeconds.p95,
    candidate.neverMatched.rate,
    candidate.immediateRematch.rate,
    -candidate.pods.sizes['4'].rate,
    -candidate.assignment.preferredPool.rate,
  ];
  const otherObjectives = [
    other.matchedWaitSeconds.p95,
    other.neverMatched.rate,
    other.immediateRematch.rate,
    -other.pods.sizes['4'].rate,
    -other.assignment.preferredPool.rate,
  ];
  return candidateObjectives.every((value, index) => value <= otherObjectives[index]!) &&
    candidateObjectives.some((value, index) => value < otherObjectives[index]!);
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const row = (values: readonly string[]) =>
    values.map((value, index) => value.padEnd(widths[index] ?? value.length)).join('  ').trimEnd();
  return [row(headers), row(widths.map((width) => '-'.repeat(width))), ...rows.map(row)].join('\n');
}

function countRate(value: { count: number; rate: number }): string {
  return `${value.count} (${percent(value.rate)})`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function duration(seconds: number): string {
  return `${(seconds / 60).toFixed(2)}m`;
}

function formatPod(value: { firstPodSize: number | null; firstPodStartedAt: number | null }): string {
  if (value.firstPodSize === null || value.firstPodStartedAt === null) return 'none';
  return `${value.firstPodSize}p @ ${value.firstPodStartedAt}s`;
}
