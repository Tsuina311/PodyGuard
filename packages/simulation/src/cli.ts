#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LATEST_JSON_PATH,
  REPOSITORY_ROOT,
  committedBaselinePath,
  createArtifact,
  listCommittedBaselines,
  normalizeBaselineId,
  readArtifact,
  writeCommittedBaseline,
  writeLatestArtifacts,
  type CompactBaseline,
  type SimulationArtifact,
} from './artifacts.js';
import { benchmarkSuite, formatBenchmarkReport } from './benchmark.js';
import {
  compareArtifacts,
  formatComparisonReport,
  type ComparableArtifact,
} from './compare.js';
import { runSimulation, type SimulationRandomizationMode } from './engine.js';
import {
  formatGraceSweepReport,
  runGraceSweep,
  writeGraceSweep,
} from './grace-sweep.js';
import {
  formatOpportunityGraceSweepReport,
  runOpportunityGraceSweep,
  writeOpportunityGraceSweep,
} from './opportunity-grace-sweep.js';
import { getScenario } from './scenarios.js';
import {
  createQueueV2ExperimentalStrategy,
  createQueueV2OpportunityGraceStrategy,
  legacyV1Strategy,
  UNLIMITED_EXISTING_WAIT,
  type MatchmakingStrategy,
  type MatchmakingStrategyName,
} from './strategy.js';

const DEFAULT_BASELINE = resolve(
  REPOSITORY_ROOT,
  'packages/simulation/baselines/matcher-legacy-v1.json',
);

type Arguments = {
  positionals: string[];
  flags: Map<string, string | boolean>;
};

async function main(): Promise<void> {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const args = parseArguments(rest);
  switch (command) {
    case 'run':
      runCommand(args);
      break;
    case 'benchmark':
      benchmarkCommand(args);
      break;
    case 'sweep':
      sweepCommand(args);
      break;
    case 'sweep-opportunity':
      sweepOpportunityCommand(args);
      break;
    case 'compare':
      compareCommand(args);
      break;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      throw new Error(`Unknown simulation command "${command}".`);
  }
}

function runCommand(args: Arguments): void {
  assertOnlyFlags(args, [
    'scenario',
    'seed',
    'verbose',
    'strategy',
    'grace',
    'max-existing-wait',
    'randomization',
  ]);
  const scenarioId = stringFlag(args, 'scenario') ?? 'NORMAL_FRIDAY_40';
  const seed = integerFlag(args, 'seed', 1);
  const verbose = booleanFlag(args, 'verbose');
  const strategy = strategyFlag(args);
  const randomizationMode = randomizationFlag(args);
  const result = runSimulation(getScenario(scenarioId), {
    seed,
    strategy,
    randomizationMode,
    debug: verbose,
  });
  const metrics = result.metrics;
  console.log(`${scenarioId} seed=${seed} strategy=${result.metadata.strategyId}`);
  console.log(
    `participants=${result.record.participants.length} games=${metrics.games.completed} waits median=${minutes(metrics.matchedWaitSeconds.median)} p95=${minutes(metrics.matchedWaitSeconds.p95)} max=${minutes(metrics.matchedWaitSeconds.max)}`,
  );
  console.log(
    `unmatched=${percent(metrics.unmatched.rate)} preferred=${percent(metrics.assignment.preferredPoolRate)} secondary=${percent(metrics.assignment.secondaryPoolRate)} immediate-rematch=${percent(metrics.opponents.immediateRematchRate)}`,
  );
  console.log(
    `pods=${JSON.stringify(metrics.pods.counts)} requeue=${percent(metrics.games.requeueRate)} table-utilisation=${percent(metrics.tables.utilisation)} invariant-failures=${metrics.safety.violationCount}`,
  );
  if (verbose) {
    console.log('\nTimeline');
    for (const entry of result.timeline ?? []) {
      console.log(`${entry.at.toString().padStart(5)}s  ${entry.event.padEnd(14)} ${entry.detail}`);
    }
  }
}

function benchmarkCommand(args: Arguments): SimulationArtifact {
  assertOnlyFlags(args, [
    'runs',
    'seed',
    'seed-start',
    'save-baseline',
    'strategy',
    'grace',
    'max-existing-wait',
    'randomization',
  ]);
  const runs = integerFlag(args, 'runs', 1000);
  const seedStart = integerFlag(args, 'seed-start', integerFlag(args, 'seed', 1));
  const saveBaseline = stringFlag(args, 'save-baseline');
  const strategy = strategyFlag(args);
  const randomizationMode = args.flags.has('randomization') ? randomizationFlag(args) : undefined;
  const benchmark = benchmarkSuite({
    runs,
    seedStart,
    strategy,
    randomizationMode,
    onProgress: process.stdout.isTTY
      ? (completed, total) => {
          if (completed === total || completed % Math.max(1, Math.floor(total / 20)) === 0) {
            process.stderr.write(`\rSimulating ${completed}/${total} nights`);
            if (completed === total) process.stderr.write('\n');
          }
        }
      : undefined,
  });
  const artifact = createArtifact(benchmark);
  const paths = writeLatestArtifacts(artifact);
  console.log(formatBenchmarkReport(benchmark));
  console.log(`\nArtifacts: ${paths.jsonPath}\n           ${paths.csvPath}`);
  if (saveBaseline) {
    const committed = writeCommittedBaseline(artifact, saveBaseline);
    console.log(`Baseline:  ${committed.path}`);
  }
  if (benchmark.global.invariantFailures > 0) {
    process.exitCode = 1;
  }
  return artifact;
}

function sweepCommand(args: Arguments): void {
  assertOnlyFlags(args, ['runs', 'seed', 'seed-start']);
  const runs = integerFlag(args, 'runs', 100);
  const seedStart = integerFlag(args, 'seed-start', integerFlag(args, 'seed', 1));
  const result = runGraceSweep({
    runs,
    seedStart,
    onProgress: process.stdout.isTTY
      ? (completed, total) => {
          if (completed === total || completed % Math.max(1, Math.floor(total / 100)) === 0) {
            process.stderr.write(`\rSweeping ${completed}/${total} nights`);
            if (completed === total) process.stderr.write('\n');
          }
        }
      : undefined,
  });
  const path = writeGraceSweep(result);
  console.log(formatGraceSweepReport(result));
  console.log(`\nArtifact: ${path}`);
  if (result.candidates.some((candidate) => candidate.global.invariantFailures > 0)) {
    process.exitCode = 1;
  }
}

function sweepOpportunityCommand(args: Arguments): void {
  assertOnlyFlags(args, ['runs', 'seed', 'seed-start']);
  const runs = integerFlag(args, 'runs', 100);
  const seedStart = integerFlag(args, 'seed-start', integerFlag(args, 'seed', 1));
  const result = runOpportunityGraceSweep({
    runs,
    seedStart,
    onProgress: process.stdout.isTTY
      ? (completed, total) => {
          if (completed === total || completed % Math.max(1, Math.floor(total / 100)) === 0) {
            process.stderr.write(`\rOpportunity sweep ${completed}/${total} nights`);
            if (completed === total) process.stderr.write('\n');
          }
        }
      : undefined,
  });
  const path = writeOpportunityGraceSweep(result);
  console.log(formatOpportunityGraceSweepReport(result));
  console.log(`\nArtifact: ${path}`);
  if (result.candidates.some((candidate) => candidate.global.invariantFailures > 0)) {
    process.exitCode = 1;
  }
}

function compareCommand(args: Arguments): void {
  assertOnlyFlags(args, ['baseline', 'candidate', 'runs', 'seed', 'seed-start']);
  const baselinePath = resolveArtifactRef(
    stringFlag(args, 'baseline') ?? args.positionals[0] ?? DEFAULT_BASELINE,
  );
  if (!existsSync(baselinePath)) {
    const available = listCommittedBaselines()
      .map((path) => path.split('/').at(-1))
      .join(', ');
    throw new Error(
      `Baseline not found: ${baselinePath}. Pass --baseline <id|artifact.json>. Committed: ${available || 'none'}.`,
    );
  }
  const baseline = readArtifact(baselinePath);
  console.log(`Baseline:  ${baselinePath}`);
  const requestedCandidate = stringFlag(args, 'candidate') ?? args.positionals[1];
  const candidate = resolveCandidate(args, baseline, requestedCandidate);
  const comparison = compareArtifacts(baseline, candidate);
  console.log(formatComparisonReport(comparison, { baseline, candidate }));
  if (comparison.hardFailure) process.exitCode = 1;
}

function resolveCandidate(
  args: Arguments,
  baseline: ComparableArtifact,
  requested: string | undefined,
): ComparableArtifact {
  if (requested && requested !== 'current') {
    return readArtifact(resolveArtifactRef(requested));
  }
  if (!requested && existsSync(LATEST_JSON_PATH)) {
    const latest = readArtifact(LATEST_JSON_PATH);
    if (artifactsAreEquivalent(latest, baseline)) {
      console.log(`Candidate: ${LATEST_JSON_PATH}`);
      return latest;
    }
    console.log('Latest artifact is incompatible with the baseline; rerunning the equivalent suite.');
  }
  const runs = integerFlag(args, 'runs', baseline.metadata.runsPerScenario);
  const seedStart = integerFlag(
    args,
    'seed-start',
    integerFlag(args, 'seed', baseline.metadata.seedStart),
  );
  console.log(`Candidate: current legacy matcher (${runs} runs/scenario, seed start ${seedStart})`);
  return createArtifact(benchmarkSuite({ runs, seedStart }));
}

function artifactsAreEquivalent(
  candidate: SimulationArtifact | CompactBaseline,
  baseline: ComparableArtifact,
): boolean {
  return (
    candidate.schemaVersion === baseline.schemaVersion &&
    candidate.definitions.suite === baseline.definitions.suite &&
    candidate.definitions.engine === baseline.definitions.engine &&
    candidate.metadata.runsPerScenario === baseline.metadata.runsPerScenario &&
    candidate.metadata.seedStart === baseline.metadata.seedStart &&
    candidate.metadata.seedEnd === baseline.metadata.seedEnd &&
    Object.keys(candidate.scenarios).sort().join('\0') ===
      Object.keys(baseline.scenarios).sort().join('\0')
  );
}

function parseArguments(values: readonly string[]): Arguments {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const equals = value.indexOf('=');
    if (equals !== -1) {
      flags.set(value.slice(2, equals), value.slice(equals + 1));
      continue;
    }
    const name = value.slice(2);
    const following = values[index + 1];
    if (following !== undefined && !following.startsWith('--')) {
      flags.set(name, following);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { positionals, flags };
}

function assertOnlyFlags(args: Arguments, allowed: readonly string[]): void {
  for (const flag of args.flags.keys()) {
    if (!allowed.includes(flag)) throw new Error(`Unknown option --${flag}.`);
  }
}

function stringFlag(args: Arguments, name: string): string | undefined {
  const value = args.flags.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`--${name} requires a value.`);
  return value;
}

function booleanFlag(args: Arguments, name: string): boolean {
  return args.flags.get(name) === true;
}

function integerFlag(args: Arguments, name: string, fallback: number): number {
  const raw = stringFlag(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} must be a safe integer.`);
  return value;
}

function strategyFlag(args: Arguments): MatchmakingStrategy {
  const name = (stringFlag(args, 'strategy') ?? 'legacy-v1') as MatchmakingStrategyName;
  const graceSeconds = integerFlag(args, 'grace', 0);
  if (graceSeconds < 0) throw new Error('--grace must be non-negative.');
  switch (name) {
    case 'legacy-v1':
      return legacyV1Strategy;
    case 'queue-v2-experimental':
      return createQueueV2ExperimentalStrategy(graceSeconds);
    case 'queue-v2-opportunity-grace':
      return createQueueV2OpportunityGraceStrategy(graceSeconds, maxExistingWaitFlag(args));
    default:
      throw new Error(
        `--strategy must be legacy-v1, queue-v2-experimental, or queue-v2-opportunity-grace, received "${String(name)}".`,
      );
  }
}

function maxExistingWaitFlag(args: Arguments): number {
  const raw = stringFlag(args, 'max-existing-wait');
  if (raw === undefined || raw === 'unlimited') return UNLIMITED_EXISTING_WAIT;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('--max-existing-wait must be a non-negative safe integer or unlimited.');
  }
  return value;
}

function randomizationFlag(args: Arguments): SimulationRandomizationMode {
  const mode = stringFlag(args, 'randomization') ?? 'legacy';
  if (mode !== 'legacy' && mode !== 'paired-v1') {
    throw new Error(`--randomization must be legacy or paired-v1, received "${mode}".`);
  }
  return mode;
}

function resolveArtifactRef(ref: string): string {
  const asPath = resolvePath(ref);
  if (existsSync(asPath)) return asPath;
  try {
    const committed = committedBaselinePath(normalizeBaselineId(ref));
    if (existsSync(committed)) return committed;
  } catch {
    // Fall through to the original path so the caller can emit a not-found error.
  }
  return asPath;
}

function resolvePath(path: string): string {
  return resolve(process.cwd(), path);
}

function minutes(seconds: number): string {
  return `${(seconds / 60).toFixed(2)}m`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function printUsage(): void {
  console.log(`PodyGuard simulation laboratory

  yarn simulation:run --scenario NORMAL_FRIDAY_40 --seed 1 [--strategy legacy-v1|queue-v2-experimental|queue-v2-opportunity-grace] [--grace 120] [--max-existing-wait 300|unlimited] [--randomization legacy|paired-v1] [--verbose]
  yarn simulation:benchmark [--runs 1000] [--seed-start 1] [--strategy legacy-v1|queue-v2-experimental|queue-v2-opportunity-grace] [--grace 120] [--max-existing-wait 300|unlimited] [--randomization legacy|paired-v1] [--save-baseline queue-v2-alpha]
  yarn simulation:sweep [--runs 100] [--seed-start 1]
  yarn simulation:sweep-opportunity [--runs 100] [--seed-start 1]
  yarn simulation:compare [baseline.json|legacy-v1] [candidate.json|queue-v2-grace-120s-maxwait-600s|current]

Compare defaults to packages/simulation/baselines/matcher-legacy-v1.json and uses
artifacts/simulation/latest.json when compatible, otherwise rerunning the suite.
Committed baselines in packages/simulation/baselines/ can be named by id
(legacy-v1 or matcher-legacy-v1) and printed side by side.
--save-baseline writes a compact committed copy of latest.json to
packages/simulation/baselines/matcher-<id>.json. Do not overwrite matcher-legacy-v1.json.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
