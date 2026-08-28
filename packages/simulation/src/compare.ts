import type { CompactBaseline, SimulationArtifact } from './artifacts.js';
import type { BenchmarkMetricSummary } from './benchmark.js';

export type ComparableArtifact = SimulationArtifact | CompactBaseline;

export type MetricDelta = {
  baseline: number;
  candidate: number;
  absolute: number;
  relative: number;
};

export type ComparisonResult = {
  compatible: boolean;
  hardFailure: boolean;
  warnings: readonly string[];
  errors: readonly string[];
  global: Readonly<Record<string, MetricDelta>>;
  scenarios: Readonly<Record<string, Readonly<Record<string, MetricDelta>>>>;
};

const METRICS = {
  waitMedianSeconds: (summary: BenchmarkMetricSummary) => summary.waitSeconds.median,
  waitP95Seconds: (summary: BenchmarkMetricSummary) => summary.waitSeconds.p95,
  waitMaxSeconds: (summary: BenchmarkMetricSummary) => summary.waitSeconds.max,
  unmatchedRate: (summary: BenchmarkMetricSummary) => summary.unmatched.rate,
  preferredRate: (summary: BenchmarkMetricSummary) => summary.assignment.preferredRate,
  secondaryRate: (summary: BenchmarkMetricSummary) => summary.assignment.secondaryRate,
  immediateRematchRate: (summary: BenchmarkMetricSummary) => summary.immediateRematch.rate,
  requeueRate: (summary: BenchmarkMetricSummary) => summary.requeue.rate,
  tableUtilisation: (summary: BenchmarkMetricSummary) => summary.tables.utilisation,
  runtimeMsPerNight: (summary: BenchmarkMetricSummary) =>
    summary.nights === 0 ? 0 : summary.runtimeMs / summary.nights,
  invariantFailures: (summary: BenchmarkMetricSummary) => summary.invariantFailures,
} satisfies Record<string, (summary: BenchmarkMetricSummary) => number>;

export function compareArtifacts(
  baseline: ComparableArtifact,
  candidate: ComparableArtifact,
): ComparisonResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (baseline.schemaVersion !== candidate.schemaVersion) {
    errors.push(
      `Schema mismatch: baseline=${baseline.schemaVersion}, candidate=${candidate.schemaVersion}.`,
    );
  }
  if (baseline.definitions.suite !== candidate.definitions.suite) {
    errors.push(
      `Suite mismatch: baseline=${baseline.definitions.suite}, candidate=${candidate.definitions.suite}.`,
    );
  }
  if (baseline.definitions.engine !== candidate.definitions.engine) {
    errors.push(
      `Engine mismatch: baseline=${baseline.definitions.engine}, candidate=${candidate.definitions.engine}.`,
    );
  }
  if (
    baseline.metadata.runsPerScenario !== candidate.metadata.runsPerScenario ||
    baseline.metadata.seedStart !== candidate.metadata.seedStart ||
    baseline.metadata.seedEnd !== candidate.metadata.seedEnd
  ) {
    errors.push('Run count or seed range differs between baseline and candidate.');
  }
  const baselineScenarioIds = Object.keys(baseline.scenarios).sort();
  const candidateScenarioIds = Object.keys(candidate.scenarios).sort();
  if (baselineScenarioIds.join('\0') !== candidateScenarioIds.join('\0')) {
    errors.push('Scenario definitions differ between baseline and candidate.');
  }

  const global = metricDeltas(baseline.global, candidate.global);
  addRegressionWarnings('global', global, warnings);

  const scenarios: Record<string, Readonly<Record<string, MetricDelta>>> = {};
  for (const scenarioId of baselineScenarioIds) {
    const baselineSummary = baseline.scenarios[scenarioId];
    const candidateSummary = candidate.scenarios[scenarioId];
    if (!baselineSummary || !candidateSummary) continue;
    const deltas = metricDeltas(baselineSummary, candidateSummary);
    scenarios[scenarioId] = deltas;
    addRegressionWarnings(scenarioId, deltas, warnings);
  }

  const safetyFailures = candidate.global.invariantFailures;
  if (safetyFailures > 0) {
    errors.push(`Hard safety failure: candidate contains ${safetyFailures} invariant violation(s).`);
  }

  return {
    compatible: errors.every((error) => !error.includes('mismatch') && !error.includes('differ')),
    hardFailure: errors.length > 0,
    warnings,
    errors,
    global,
    scenarios,
  };
}

export function formatComparisonReport(result: ComparisonResult): string {
  const lines = [
    `Simulation comparison: ${result.hardFailure ? 'FAIL' : result.warnings.length ? 'WARN' : 'PASS'}`,
    ...formatDeltaLines(result.global).map((line) => `  ${line}`),
  ];
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings', ...result.warnings.map((warning) => `  - ${warning}`));
  }
  if (result.errors.length > 0) {
    lines.push('', 'Errors', ...result.errors.map((error) => `  - ${error}`));
  }
  return lines.join('\n');
}

function metricDeltas(
  baseline: BenchmarkMetricSummary,
  candidate: BenchmarkMetricSummary,
): Readonly<Record<string, MetricDelta>> {
  return Object.fromEntries(
    Object.entries(METRICS).map(([name, select]) => {
      const baselineValue = select(baseline);
      const candidateValue = select(candidate);
      return [
        name,
        {
          baseline: baselineValue,
          candidate: candidateValue,
          absolute: candidateValue - baselineValue,
          relative:
            baselineValue === 0
              ? candidateValue === 0
                ? 0
                : Number.POSITIVE_INFINITY
              : (candidateValue - baselineValue) / Math.abs(baselineValue),
        },
      ];
    }),
  );
}

function addRegressionWarnings(
  scope: string,
  deltas: Readonly<Record<string, MetricDelta>>,
  warnings: string[],
): void {
  warnIf(deltas.waitMedianSeconds, 0.1, 30, scope, 'median wait', warnings);
  warnIf(deltas.waitP95Seconds, 0.1, 60, scope, 'P95 wait', warnings);
  warnIf(deltas.waitMaxSeconds, 0.15, 120, scope, 'maximum wait', warnings);
  warnIf(deltas.unmatchedRate, 0, 0.01, scope, 'unmatched rate', warnings);
  warnIf(deltas.immediateRematchRate, 0, 0.01, scope, 'immediate-rematch rate', warnings);
  warnIf(deltas.runtimeMsPerNight, 0.2, 2, scope, 'runtime/night', warnings);
  const preferred = deltas.preferredRate;
  if (preferred && preferred.absolute < -0.01) {
    warnings.push(`${scope}: preferred assignment rate fell ${formatPercent(-preferred.absolute)}.`);
  }
  const utilisation = deltas.tableUtilisation;
  if (utilisation && utilisation.absolute < -0.05) {
    warnings.push(`${scope}: table utilisation fell ${formatPercent(-utilisation.absolute)}.`);
  }
}

function warnIf(
  delta: MetricDelta | undefined,
  relativeThreshold: number,
  absoluteThreshold: number,
  scope: string,
  label: string,
  warnings: string[],
): void {
  if (
    delta &&
    delta.absolute > absoluteThreshold &&
    (relativeThreshold === 0 || delta.relative > relativeThreshold)
  ) {
    warnings.push(
      `${scope}: ${label} increased ${formatDelta(delta.absolute)} (${formatPercent(delta.relative)}).`,
    );
  }
}

function formatDeltaLines(deltas: Readonly<Record<string, MetricDelta>>): string[] {
  return Object.entries(deltas).map(
    ([name, delta]) =>
      `${name}: ${formatValue(delta.baseline)} → ${formatValue(delta.candidate)} (${formatDelta(delta.absolute)})`,
  );
}

function formatValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : String(value);
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatValue(value)}`;
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '∞';
}
