import { performance } from 'node:perf_hooks';

import { runSimulation, SIMULATION_ENGINE_VERSION, type SimulationResult } from './engine.js';
import {
  distributionMetrics,
  type EventMetricRecord,
  type EventMetrics,
  type SafetyViolation,
} from './metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION } from './scenarios.js';
import { legacyV1Strategy, type MatchmakingStrategy } from './strategy.js';

export type BenchmarkOptions = {
  runs?: number;
  seedStart?: number;
  strategy?: MatchmakingStrategy;
  onProgress?: (completed: number, total: number) => void;
};

export type BenchmarkMetricSummary = {
  nights: number;
  participants: number;
  runtimeMs: number;
  waitSeconds: {
    count: number;
    median: number;
    p95: number;
    max: number;
  };
  unmatched: { participants: number; rate: number };
  assignment: {
    seats: number;
    preferred: number;
    preferredRate: number;
    secondary: number;
    secondaryRate: number;
  };
  immediateRematch: { pairs: number; rate: number };
  podDistribution: Readonly<Record<string, number>>;
  requeue: { count: number; decisions: number; rate: number };
  tables: { occupiedSeconds: number; availableSeconds: number; utilisation: number };
  invariantFailures: number;
};

export type BenchmarkNight = {
  scenarioId: string;
  seed: number;
  runtimeMs: number;
  participants: number;
  metrics: EventMetrics;
};

export type BenchmarkResult = {
  suiteVersion: string;
  strategyId: string;
  engineVersion: string;
  runsPerScenario: number;
  seedStart: number;
  elapsedMs: number;
  records: readonly EventMetricRecord[];
  nights: readonly BenchmarkNight[];
  global: BenchmarkMetricSummary;
  scenarios: Readonly<Record<string, BenchmarkMetricSummary>>;
};

export function benchmarkSuite(options: BenchmarkOptions = {}): BenchmarkResult {
  const runs = options.runs ?? 1000;
  const seedStart = options.seedStart ?? 1;
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new Error(`Benchmark runs must be a positive safe integer, received ${runs}.`);
  }
  if (!Number.isSafeInteger(seedStart)) {
    throw new Error(`Benchmark seed start must be a safe integer, received ${seedStart}.`);
  }

  const strategy = options.strategy ?? legacyV1Strategy;
  const records: EventMetricRecord[] = [];
  const nights: BenchmarkNight[] = [];
  const runtimeByRecord = new Map<EventMetricRecord, number>();
  const total = SCENARIOS.length * runs;
  const suiteStarted = performance.now();

  for (const scenario of SCENARIOS) {
    for (let run = 0; run < runs; run += 1) {
      const seed = seedStart + run;
      if (!Number.isSafeInteger(seed)) {
        throw new Error(`Benchmark seed overflow at ${seedStart} + ${run}.`);
      }
      const started = performance.now();
      const result: SimulationResult = runSimulation(scenario, {
        seed,
        strategy,
      });
      const runtimeMs = performance.now() - started;
      records.push(result.record);
      runtimeByRecord.set(result.record, runtimeMs);
      nights.push({
        scenarioId: scenario.id,
        seed,
        runtimeMs,
        participants: result.record.participants.length,
        metrics: result.metrics,
      });
      options.onProgress?.(records.length, total);
    }
  }

  const scenarios = Object.fromEntries(
    SCENARIOS.map((scenario) => {
      const selected = records.filter((record) => record.scenarioId === scenario.id);
      return [scenario.id, aggregateRecords(selected, runtimeByRecord)];
    }),
  );

  return {
    suiteVersion: SCENARIO_SUITE_VERSION,
    strategyId: strategy.id,
    engineVersion: SIMULATION_ENGINE_VERSION,
    runsPerScenario: runs,
    seedStart,
    elapsedMs: performance.now() - suiteStarted,
    records,
    nights,
    global: aggregateRecords(records, runtimeByRecord),
    scenarios,
  };
}

export function aggregateRecords(
  records: readonly EventMetricRecord[],
  runtimes?: ReadonlyMap<EventMetricRecord, number>,
): BenchmarkMetricSummary {
  const waits = records.flatMap((record) =>
    record.queueCycles
      .filter((cycle) => cycle.reason === 'matched')
      .map((cycle) => cycle.endedAt - cycle.startedAt),
  );
  const waitDistribution = distributionMetrics(waits);
  let participants = 0;
  let unmatched = 0;
  let seats = 0;
  let preferred = 0;
  let secondary = 0;
  let pairEncounters = 0;
  let immediateRematchPairs = 0;
  let requeues = 0;
  let decisions = 0;
  let occupiedSeconds = 0;
  let availableSeconds = 0;
  let invariantFailures = 0;
  const podDistribution: Record<string, number> = {};

  for (const record of records) {
    const played = new Set(record.games.flatMap((game) => game.seats.map((seat) => seat.participantId)));
    const allSeats = record.games.flatMap((game) => game.seats);
    participants += record.participants.length;
    unmatched += record.participants.length - played.size;
    seats += allSeats.length;
    preferred += allSeats.filter((seat) => seat.assignedPoolId === seat.preferredPoolId).length;
    secondary += allSeats.filter(
      (seat) =>
        seat.assignedPoolId !== seat.preferredPoolId &&
        seat.acceptedPoolIds.includes(seat.assignedPoolId),
    ).length;
    const opponentCounts = calculateImmediateRematches(record);
    pairEncounters += opponentCounts.pairEncounters;
    immediateRematchPairs += opponentCounts.immediateRematchPairs;
    const completedDecisions = allSeats.filter((seat) => seat.postGameDecision !== 'event-closed');
    decisions += completedDecisions.length;
    requeues += completedDecisions.filter((seat) => seat.postGameDecision === 'requeue').length;
    for (const game of record.games) {
      const key = String(game.seats.length);
      podDistribution[key] = (podDistribution[key] ?? 0) + 1;
    }
    occupiedSeconds += sumPeriods(record, 'occupied');
    availableSeconds +=
      record.durationSeconds * new Set(record.tablePeriods.map((period) => period.tableId)).size -
      sumPeriods(record, 'disabled');
    invariantFailures += record.safetyViolations.length;
  }

  return {
    nights: records.length,
    participants,
    runtimeMs: records.reduce((sum, record) => sum + (runtimes?.get(record) ?? 0), 0),
    waitSeconds: {
      count: waitDistribution.count,
      median: waitDistribution.median,
      p95: waitDistribution.p95,
      max: waitDistribution.max,
    },
    unmatched: { participants: unmatched, rate: divide(unmatched, participants) },
    assignment: {
      seats,
      preferred,
      preferredRate: divide(preferred, seats),
      secondary,
      secondaryRate: divide(secondary, seats),
    },
    immediateRematch: {
      pairs: immediateRematchPairs,
      rate: divide(immediateRematchPairs, pairEncounters),
    },
    podDistribution,
    requeue: { count: requeues, decisions, rate: divide(requeues, decisions) },
    tables: {
      occupiedSeconds,
      availableSeconds,
      utilisation: divide(occupiedSeconds, availableSeconds),
    },
    invariantFailures,
  };
}

export function formatBenchmarkReport(result: BenchmarkResult): string {
  const lines = [
    `Simulation benchmark: ${result.strategyId} · ${result.runsPerScenario} runs/scenario · ${result.nights.length} nights`,
    formatSummary('GLOBAL', result.global),
    '',
    'Per scenario',
    ...SCENARIOS.map((scenario) => formatSummary(scenario.id, result.scenarios[scenario.id]!)),
    '',
    `Wall time: ${formatNumber(result.elapsedMs / 1000)}s`,
  ];
  return lines.join('\n');
}

function formatSummary(label: string, value: BenchmarkMetricSummary): string {
  const pods = Object.entries(value.podDistribution)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([size, count]) => `${size}:${count}`)
    .join(' ');
  return [
    `${label}: nights=${value.nights} participants=${value.participants} runtime=${formatNumber(value.runtimeMs)}ms`,
    `  waits median=${formatDuration(value.waitSeconds.median)} p95=${formatDuration(value.waitSeconds.p95)} max=${formatDuration(value.waitSeconds.max)} unmatched=${formatPercent(value.unmatched.rate)}`,
    `  preferred=${formatPercent(value.assignment.preferredRate)} secondary=${formatPercent(value.assignment.secondaryRate)} immediate-rematch=${formatPercent(value.immediateRematch.rate)}`,
    `  pods=[${pods}] requeue=${formatPercent(value.requeue.rate)} table-utilisation=${formatPercent(value.tables.utilisation)} invariant-failures=${value.invariantFailures}`,
  ].join('\n');
}

function calculateImmediateRematches(record: EventMetricRecord): {
  pairEncounters: number;
  immediateRematchPairs: number;
} {
  const lastGame = new Map<string, string>();
  let pairEncounters = 0;
  let immediateRematchPairs = 0;
  for (const game of [...record.games].sort(
    (left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id),
  )) {
    const ids = game.seats.map((seat) => seat.participantId);
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const leftId = ids[left];
        const rightId = ids[right];
        if (!leftId || !rightId) continue;
        pairEncounters += 1;
        if (lastGame.get(leftId) !== undefined && lastGame.get(leftId) === lastGame.get(rightId)) {
          immediateRematchPairs += 1;
        }
      }
    }
    ids.forEach((id) => lastGame.set(id, game.id));
  }
  return { pairEncounters, immediateRematchPairs };
}

function sumPeriods(record: EventMetricRecord, state: 'occupied' | 'disabled'): number {
  return record.tablePeriods
    .filter((period) => period.state === state)
    .reduce((sum, period) => sum + Math.max(0, period.endedAt - period.startedAt), 0);
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100)}%`;
}

function formatDuration(seconds: number): string {
  return `${formatNumber(seconds / 60)}m`;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

export function violationsFromError(error: unknown): readonly SafetyViolation[] {
  return typeof error === 'object' && error !== null && 'violations' in error
    ? ((error as { violations?: readonly SafetyViolation[] }).violations ?? [])
    : [];
}
