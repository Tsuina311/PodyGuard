#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LATEST_JSON_PATH,
  REPOSITORY_ROOT,
  createArtifact,
  readArtifact,
  writeLatestArtifacts,
  type CompactBaseline,
  type SimulationArtifact,
} from './artifacts.js';
import { benchmarkSuite, formatBenchmarkReport } from './benchmark.js';
import { compareArtifacts, formatComparisonReport, type ComparableArtifact } from './compare.js';
import { runSimulation } from './engine.js';
import { getScenario } from './scenarios.js';

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
  assertOnlyFlags(args, ['scenario', 'seed', 'verbose']);
  const scenarioId = stringFlag(args, 'scenario') ?? 'NORMAL_FRIDAY_40';
  const seed = integerFlag(args, 'seed', 1);
  const verbose = booleanFlag(args, 'verbose');
  const result = runSimulation(getScenario(scenarioId), { seed, debug: verbose });
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
  assertOnlyFlags(args, ['runs', 'seed', 'seed-start']);
  const runs = integerFlag(args, 'runs', 1000);
  const seedStart = integerFlag(args, 'seed-start', integerFlag(args, 'seed', 1));
  const benchmark = benchmarkSuite({
    runs,
    seedStart,
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
  if (benchmark.global.invariantFailures > 0) {
    process.exitCode = 1;
  }
  return artifact;
}

function compareCommand(args: Arguments): void {
  assertOnlyFlags(args, ['baseline', 'candidate', 'runs', 'seed', 'seed-start']);
  const baselinePath = resolvePath(stringFlag(args, 'baseline') ?? args.positionals[0] ?? DEFAULT_BASELINE);
  if (!existsSync(baselinePath)) {
    throw new Error(
      `Baseline not found: ${baselinePath}. Pass --baseline <artifact.json> or add the default baseline.`,
    );
  }
  const baseline = readArtifact(baselinePath);
  const requestedCandidate = stringFlag(args, 'candidate') ?? args.positionals[1];
  const candidate = resolveCandidate(args, baseline, requestedCandidate);
  const comparison = compareArtifacts(baseline, candidate);
  console.log(formatComparisonReport(comparison));
  if (comparison.hardFailure) process.exitCode = 1;
}

function resolveCandidate(
  args: Arguments,
  baseline: ComparableArtifact,
  requested: string | undefined,
): ComparableArtifact {
  if (requested && requested !== 'current') {
    return readArtifact(resolvePath(requested));
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

  yarn simulation:run --scenario NORMAL_FRIDAY_40 --seed 1 [--verbose]
  yarn simulation:benchmark [--runs 1000] [--seed-start 1]
  yarn simulation:compare [baseline.json] [candidate.json|current]

Compare defaults to packages/simulation/baselines/matcher-legacy-v1.json and uses
artifacts/simulation/latest.json when compatible, otherwise rerunning the suite.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
