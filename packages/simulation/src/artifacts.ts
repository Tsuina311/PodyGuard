import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BenchmarkMetricSummary, BenchmarkNight, BenchmarkResult } from './benchmark.js';

export const ARTIFACT_SCHEMA_VERSION = 1;
export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DEFAULT_ARTIFACT_DIRECTORY = resolve(REPOSITORY_ROOT, 'artifacts/simulation');
export const LATEST_JSON_PATH = resolve(DEFAULT_ARTIFACT_DIRECTORY, 'latest.json');
export const LATEST_CSV_PATH = resolve(DEFAULT_ARTIFACT_DIRECTORY, 'latest.csv');

export type SimulationArtifact = {
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  metadata: {
    suiteVersion: string;
    strategyId: string;
    engineVersion: string;
    runsPerScenario: number;
    seedStart: number;
    seedEnd: number;
    elapsedMs: number;
    scenarioIds: readonly string[];
    gitSha?: string;
  };
  definitions: {
    suite: string;
    strategy: string;
    engine: string;
  };
  environment: {
    node: string;
    platform: NodeJS.Platform;
    architecture: string;
  };
  global: BenchmarkMetricSummary;
  scenarios: Readonly<Record<string, BenchmarkMetricSummary>>;
  nights: readonly BenchmarkNight[];
};

export type CompactBaseline = {
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  metadata: SimulationArtifact['metadata'];
  definitions: SimulationArtifact['definitions'];
  global: BenchmarkMetricSummary;
  scenarios: Readonly<Record<string, BenchmarkMetricSummary>>;
};

export function createArtifact(
  benchmark: BenchmarkResult,
  generatedAt = new Date().toISOString(),
): SimulationArtifact {
  const gitSha = readGitSha();
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    generatedAt,
    metadata: {
      suiteVersion: benchmark.suiteVersion,
      strategyId: benchmark.strategyId,
      engineVersion: benchmark.engineVersion,
      runsPerScenario: benchmark.runsPerScenario,
      seedStart: benchmark.seedStart,
      seedEnd: benchmark.seedStart + benchmark.runsPerScenario - 1,
      elapsedMs: benchmark.elapsedMs,
      scenarioIds: Object.keys(benchmark.scenarios),
      ...(gitSha ? { gitSha } : {}),
    },
    definitions: {
      suite: benchmark.suiteVersion,
      strategy: benchmark.strategyId,
      engine: benchmark.engineVersion,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    global: benchmark.global,
    scenarios: benchmark.scenarios,
    nights: benchmark.nights,
  };
}

export function compactBaseline(artifact: SimulationArtifact): CompactBaseline {
  return {
    schemaVersion: artifact.schemaVersion,
    generatedAt: artifact.generatedAt,
    metadata: artifact.metadata,
    definitions: artifact.definitions,
    global: artifact.global,
    scenarios: artifact.scenarios,
  };
}

export function writeLatestArtifacts(
  artifact: SimulationArtifact,
  directory = DEFAULT_ARTIFACT_DIRECTORY,
): { jsonPath: string; csvPath: string } {
  mkdirSync(directory, { recursive: true });
  const jsonPath = resolve(directory, 'latest.json');
  const csvPath = resolve(directory, 'latest.csv');
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  writeFileSync(csvPath, artifactToCsv(artifact), 'utf8');
  return { jsonPath, csvPath };
}

export function readArtifact(path: string): SimulationArtifact | CompactBaseline {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assertArtifact(parsed, path);
  return parsed;
}

export function artifactToCsv(artifact: SimulationArtifact): string {
  const columns = [
    'schemaVersion',
    'generatedAt',
    'suiteVersion',
    'strategyId',
    'engineVersion',
    'scenarioId',
    'seed',
    'runtimeMs',
    'participants',
    'waitMedianSeconds',
    'waitP95Seconds',
    'waitMaxSeconds',
    'unmatchedParticipants',
    'unmatchedRate',
    'preferredAssignments',
    'preferredRate',
    'secondaryAssignments',
    'secondaryRate',
    'immediateRematchPairs',
    'immediateRematchRate',
    'podDistribution',
    'requeues',
    'requeueRate',
    'tableUtilisation',
    'invariantFailures',
  ];
  const rows = artifact.nights.map((night) => {
    const metrics = night.metrics;
    return [
      artifact.schemaVersion,
      artifact.generatedAt,
      artifact.metadata.suiteVersion,
      artifact.metadata.strategyId,
      artifact.metadata.engineVersion,
      night.scenarioId,
      night.seed,
      night.runtimeMs,
      night.participants,
      metrics.matchedWaitSeconds.median,
      metrics.matchedWaitSeconds.p95,
      metrics.matchedWaitSeconds.max,
      metrics.unmatched.participants,
      metrics.unmatched.rate,
      metrics.assignment.preferredPool,
      metrics.assignment.preferredPoolRate,
      metrics.assignment.secondaryPool,
      metrics.assignment.secondaryPoolRate,
      metrics.opponents.immediateRematchPairs,
      metrics.opponents.immediateRematchRate,
      JSON.stringify(metrics.pods.counts),
      metrics.games.requeues,
      metrics.games.requeueRate,
      metrics.tables.utilisation,
      metrics.safety.violationCount,
    ];
  });
  return [columns, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function isFullArtifact(
  artifact: SimulationArtifact | CompactBaseline,
): artifact is SimulationArtifact {
  return 'nights' in artifact && 'environment' in artifact;
}

function assertArtifact(
  value: unknown,
  path: string,
): asserts value is SimulationArtifact | CompactBaseline {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
    !('metadata' in value) ||
    !('global' in value) ||
    !('scenarios' in value)
  ) {
    throw new Error(`Unsupported or malformed simulation artifact: ${path}.`);
  }
}

function readGitSha(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}
