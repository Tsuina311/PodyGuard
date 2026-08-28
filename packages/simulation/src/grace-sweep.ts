import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_ARTIFACT_DIRECTORY } from './artifacts.js';
import { benchmarkSuite } from './benchmark.js';
import { SIMULATION_ENGINE_VERSION } from './engine.js';
import {
  calculateEventMetrics,
  distributionMetrics,
  type EventMetricRecord,
} from './metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION } from './scenarios.js';
import { createQueueV2ExperimentalStrategy } from './strategy.js';

export const GRACE_SWEEP_SECONDS = [0, 30, 60, 90, 120, 180, 300] as const;
export const GRACE_SWEEP_SCENARIOS = [
  'SMALL_EVENT_8',
  'NORMAL_FRIDAY_40',
  'B4_STARVATION_30',
  'LATE_ARRIVALS_40',
  'ODD_PLAYER_COUNTS',
  'TABLE_SCARCITY_50',
  'LONG_GAMES_40',
] as const;
export const GRACE_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-grace-sweep.json',
);

const WAIT_THRESHOLDS = [300, 600, 900, 1_800] as const;

export type GraceSweepOptions = {
  runs?: number;
  seedStart?: number;
  onProgress?: (completed: number, total: number) => void;
};

export type CountRate = {
  count: number;
  rate: number;
};

export type GraceSweepMetricSummary = {
  nights: number;
  participants: number;
  runtimeMs: number;
  matchedWaitSeconds: {
    count: number;
    median: number;
    p95: number;
    max: number;
    overMinutes: Readonly<Record<'5' | '10' | '15' | '30', CountRate>>;
  };
  neverMatched: CountRate;
  pods: {
    total: number;
    sizes: Readonly<Record<'3' | '4' | '5', CountRate>>;
  };
  assignment: {
    seats: number;
    preferredPool: CountRate;
    secondaryPool: CountRate;
  };
  immediateRematch: {
    pairEncounters: number;
    pairs: number;
    rate: number;
  };
  requeue: CountRate;
  gamesPerAttendee: number;
  eventComposition: {
    averageMatchedPlayers: number;
    nightsWithFourPod: CountRate;
    nightsWithOnlyThreePods: CountRate;
  };
  tables: {
    occupiedSeconds: number;
    availableSeconds: number;
    utilisation: number;
  };
  invariantFailures: number;
};

export type GraceSweepCandidate = {
  graceSeconds: number;
  strategyId: string;
  reproductionCommand: string;
  global: GraceSweepMetricSummary;
  scenarios: Readonly<Record<(typeof GRACE_SWEEP_SCENARIOS)[number], GraceSweepMetricSummary>>;
};

export type GraceSweepResult = {
  schemaVersion: 1;
  generatedAt: string;
  metadata: {
    suiteVersion: string;
    engineVersion: string;
    strategyName: 'queue-v2-experimental';
    randomizationMode: 'paired-v1';
    graceSeconds: readonly number[];
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    scenarioIds: readonly string[];
    reportedScenarioIds: typeof GRACE_SWEEP_SCENARIOS;
  };
  candidates: readonly GraceSweepCandidate[];
  paretoEfficientGraceSeconds: readonly number[];
};

export function runGraceSweep(options: GraceSweepOptions = {}): GraceSweepResult {
  const runs = options.runs ?? 100;
  const seedStart = options.seedStart ?? 1;
  assertPositiveSafeInteger(runs, 'Sweep runs');
  if (!Number.isSafeInteger(seedStart)) {
    throw new Error(`Sweep seed start must be a safe integer, received ${seedStart}.`);
  }
  const total = GRACE_SWEEP_SECONDS.length * SCENARIOS.length * runs;
  let completedBeforeCandidate = 0;
  const candidates = GRACE_SWEEP_SECONDS.map((graceSeconds) => {
    const benchmark = benchmarkSuite({
      runs,
      seedStart,
      strategy: createQueueV2ExperimentalStrategy(graceSeconds),
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
    ) as GraceSweepCandidate['scenarios'];
    return {
      graceSeconds,
      strategyId: benchmark.strategyId,
      reproductionCommand:
        `yarn simulation:benchmark --runs ${runs} --seed-start ${seedStart} ` +
        `--strategy queue-v2-experimental --grace ${graceSeconds} ` +
        `--randomization paired-v1 --save-baseline queue-v2-experimental-grace-${graceSeconds}s`,
      global: aggregateGraceSweepRecords(benchmark.records, runtimeFor(benchmark.records)),
      scenarios,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metadata: {
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      strategyName: 'queue-v2-experimental',
      randomizationMode: 'paired-v1',
      graceSeconds: GRACE_SWEEP_SECONDS,
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      reportedScenarioIds: GRACE_SWEEP_SCENARIOS,
    },
    candidates,
    paretoEfficientGraceSeconds: paretoEfficientGracePeriods(candidates),
  };
}

export function aggregateGraceSweepRecords(
  records: readonly EventMetricRecord[],
  runtimeMs = 0,
): GraceSweepMetricSummary {
  const waits = records.flatMap((record) =>
    record.queueCycles
      .filter((cycle) => cycle.reason === 'matched')
      .map((cycle) => cycle.endedAt - cycle.startedAt),
  );
  const waitDistribution = distributionMetrics(waits, WAIT_THRESHOLDS);
  let participants = 0;
  let neverMatched = 0;
  let seats = 0;
  let preferredPool = 0;
  let secondaryPool = 0;
  let pairEncounters = 0;
  let immediateRematchPairs = 0;
  let participantGameDecisions = 0;
  let requeues = 0;
  let games = 0;
  let nightsWithFourPod = 0;
  let nightsWithOnlyThreePods = 0;
  let occupiedSeconds = 0;
  let availableSeconds = 0;
  let invariantFailures = 0;
  const podCounts: Record<'3' | '4' | '5', number> = { '3': 0, '4': 0, '5': 0 };

  for (const record of records) {
    const metrics = calculateEventMetrics(record, WAIT_THRESHOLDS);
    participants += record.participants.length;
    neverMatched += metrics.unmatched.participants;
    seats += metrics.assignment.seats;
    preferredPool += metrics.assignment.preferredPool;
    secondaryPool += metrics.assignment.secondaryPool;
    pairEncounters += metrics.opponents.pairEncounters;
    immediateRematchPairs += metrics.opponents.immediateRematchPairs;
    participantGameDecisions += metrics.games.participantGameDecisions;
    requeues += metrics.games.requeues;
    games += metrics.games.completed;
    if ((metrics.pods.counts['4'] ?? 0) > 0) nightsWithFourPod += 1;
    if (
      metrics.games.completed > 0 &&
      (metrics.pods.counts['3'] ?? 0) === metrics.games.completed
    ) {
      nightsWithOnlyThreePods += 1;
    }
    for (const size of ['3', '4', '5'] as const) {
      podCounts[size] += metrics.pods.counts[size] ?? 0;
    }
    occupiedSeconds += metrics.tables.occupiedSeconds;
    availableSeconds += metrics.tables.availableSeconds;
    invariantFailures += metrics.safety.violationCount;
  }

  const threshold = (seconds: (typeof WAIT_THRESHOLDS)[number]): CountRate => ({
    count: waitDistribution.overThreshold[String(seconds)] ?? 0,
    rate: waitDistribution.overThresholdRate[String(seconds)] ?? 0,
  });
  const podSize = (size: keyof typeof podCounts): CountRate => ({
    count: podCounts[size],
    rate: divide(podCounts[size], games),
  });
  return {
    nights: records.length,
    participants,
    runtimeMs,
    matchedWaitSeconds: {
      count: waitDistribution.count,
      median: waitDistribution.median,
      p95: waitDistribution.p95,
      max: waitDistribution.max,
      overMinutes: {
        '5': threshold(300),
        '10': threshold(600),
        '15': threshold(900),
        '30': threshold(1_800),
      },
    },
    neverMatched: { count: neverMatched, rate: divide(neverMatched, participants) },
    pods: {
      total: games,
      sizes: { '3': podSize('3'), '4': podSize('4'), '5': podSize('5') },
    },
    assignment: {
      seats,
      preferredPool: { count: preferredPool, rate: divide(preferredPool, seats) },
      secondaryPool: { count: secondaryPool, rate: divide(secondaryPool, seats) },
    },
    immediateRematch: {
      pairEncounters,
      pairs: immediateRematchPairs,
      rate: divide(immediateRematchPairs, pairEncounters),
    },
    requeue: {
      count: requeues,
      rate: divide(requeues, participantGameDecisions),
    },
    gamesPerAttendee: divide(seats, participants),
    eventComposition: {
      averageMatchedPlayers: divide(participants - neverMatched, records.length),
      nightsWithFourPod: {
        count: nightsWithFourPod,
        rate: divide(nightsWithFourPod, records.length),
      },
      nightsWithOnlyThreePods: {
        count: nightsWithOnlyThreePods,
        rate: divide(nightsWithOnlyThreePods, records.length),
      },
    },
    tables: {
      occupiedSeconds,
      availableSeconds,
      utilisation: divide(occupiedSeconds, availableSeconds),
    },
    invariantFailures,
  };
}

export function paretoEfficientGracePeriods(
  candidates: readonly Pick<GraceSweepCandidate, 'graceSeconds' | 'global'>[],
): number[] {
  return candidates
    .filter((candidate, index) =>
      !candidates.some((other, otherIndex) =>
        otherIndex !== index && dominates(other.global, candidate.global),
      ),
    )
    .map((candidate) => candidate.graceSeconds);
}

export function writeGraceSweep(
  result: GraceSweepResult,
  path = GRACE_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}

export function formatGraceSweepReport(result: GraceSweepResult): string {
  const pareto = new Set(result.paretoEfficientGraceSeconds);
  const lines = [
    `Queue v2 grace sweep · paired-v1 · ${result.metadata.runsPerScenario} runs/scenario · ${result.metadata.scenarioIds.length} scenarios`,
    `Pareto-efficient grace periods: ${result.paretoEfficientGraceSeconds.map((value) => `${value}s`).join(', ')}`,
  ];
  const scopes: ReadonlyArray<
    readonly [string, (candidate: GraceSweepCandidate) => GraceSweepMetricSummary]
  > = [
    ['GLOBAL', (candidate) => candidate.global],
    ...GRACE_SWEEP_SCENARIOS.map((scenarioId) =>
      [scenarioId, (candidate: GraceSweepCandidate) => candidate.scenarios[scenarioId]] as const),
  ];
  for (const [label, select] of scopes) {
    lines.push('', label);
    lines.push(table(
      ['grace', 'median', 'p95', 'max', '>5m', '>10m', '>15m', '>30m', 'never'],
      result.candidates.map((candidate) => {
        const value = select(candidate);
        return [
          `${candidate.graceSeconds}s${label === 'GLOBAL' && pareto.has(candidate.graceSeconds) ? '*' : ''}`,
          duration(value.matchedWaitSeconds.median),
          duration(value.matchedWaitSeconds.p95),
          duration(value.matchedWaitSeconds.max),
          countRate(value.matchedWaitSeconds.overMinutes['5']),
          countRate(value.matchedWaitSeconds.overMinutes['10']),
          countRate(value.matchedWaitSeconds.overMinutes['15']),
          countRate(value.matchedWaitSeconds.overMinutes['30']),
          countRate(value.neverMatched),
        ];
      }),
    ));
    lines.push(table(
      ['grace', 'pod 3', 'pod 4', 'pod 5', 'preferred', 'secondary', 'rematch', 'games/person', 'requeue', 'table util'],
      result.candidates.map((candidate) => {
        const value = select(candidate);
        return [
          `${candidate.graceSeconds}s`,
          countRate(value.pods.sizes['3']),
          countRate(value.pods.sizes['4']),
          countRate(value.pods.sizes['5']),
          countRate(value.assignment.preferredPool),
          countRate(value.assignment.secondaryPool),
          `${value.immediateRematch.pairs} (${percent(value.immediateRematch.rate)})`,
          value.gamesPerAttendee.toFixed(3),
          countRate(value.requeue),
          percent(value.tables.utilisation),
        ];
      }),
    ));
    if (label === 'SMALL_EVENT_8') {
      lines.push(table(
        ['grace', 'avg matched/event', 'never matched', 'nights w/ 4-pod', 'only 3-pods'],
        result.candidates.map((candidate) => {
          const value = select(candidate);
          return [
            `${candidate.graceSeconds}s`,
            value.eventComposition.averageMatchedPlayers.toFixed(3),
            countRate(value.neverMatched),
            countRate(value.eventComposition.nightsWithFourPod),
            countRate(value.eventComposition.nightsWithOnlyThreePods),
          ];
        }),
      ));
    }
    lines.push(table(
      ['grace', 'nights', 'participants', 'matched waits', 'invariant failures', 'runtime'],
      result.candidates.map((candidate) => {
        const value = select(candidate);
        return [
          `${candidate.graceSeconds}s`,
          String(value.nights),
          String(value.participants),
          String(value.matchedWaitSeconds.count),
          String(value.invariantFailures),
          `${(value.runtimeMs / 1_000).toFixed(2)}s`,
        ];
      }),
    ));
  }
  lines.push('', '* Pareto-efficient globally; no winner is selected.');
  return lines.join('\n');
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

function countRate(value: CountRate): string {
  return `${value.count} (${percent(value.rate)})`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function duration(seconds: number): string {
  return `${(seconds / 60).toFixed(2)}m`;
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer, received ${value}.`);
  }
}
