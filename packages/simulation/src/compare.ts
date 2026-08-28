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
  pod3Rate: (summary: BenchmarkMetricSummary) => podRate(summary, '3'),
  pod4Rate: (summary: BenchmarkMetricSummary) => podRate(summary, '4'),
  pod5Rate: (summary: BenchmarkMetricSummary) => podRate(summary, '5'),
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

export function formatComparisonReport(
  result: ComparisonResult,
  artifacts?: {
    baseline: ComparableArtifact;
    candidate: ComparableArtifact;
  },
): string {
  const baselineLabel = artifacts?.baseline.metadata.strategyId ?? 'baseline';
  const candidateLabel = artifacts?.candidate.metadata.strategyId ?? 'candidate';
  const lines = [
    `Simulation comparison: ${result.hardFailure ? 'FAIL' : result.warnings.length ? 'WARN' : 'PASS'}`,
    `Baseline:  ${baselineLabel}`,
    `Candidate: ${candidateLabel}`,
  ];
  if (artifacts) {
    lines.push('', formatSideBySideBaselines(artifacts.baseline, artifacts.candidate));
  }
  lines.push('', 'GLOBAL deltas', ...formatDeltaLines(result.global).map((line) => `  ${line}`));
  const scenarioIds = Object.keys(result.scenarios).sort();
  if (scenarioIds.length > 0) {
    lines.push('', 'Per-scenario deltas');
    for (const scenarioId of scenarioIds) {
      const deltas = result.scenarios[scenarioId];
      if (!deltas) continue;
      lines.push(`  ${scenarioId}`);
      lines.push(...formatDeltaLines(deltas).map((line) => `    ${line}`));
    }
  }
  if (result.warnings.length > 0) {
    lines.push('', 'Warnings', ...result.warnings.map((warning) => `  - ${warning}`));
  }
  if (result.errors.length > 0) {
    lines.push('', 'Errors', ...result.errors.map((error) => `  - ${error}`));
  }
  return lines.join('\n');
}

export function formatSideBySideBaselines(
  baseline: ComparableArtifact,
  candidate: ComparableArtifact,
): string {
  const scopes = [
    ['GLOBAL', baseline.global, candidate.global] as const,
    ...Object.keys(baseline.scenarios)
      .sort()
      .map((scenarioId) =>
        [
          scenarioId,
          baseline.scenarios[scenarioId]!,
          candidate.scenarios[scenarioId] ?? emptySummary(),
        ] as const,
      ),
  ];
  const lines = [
    'Committed baseline history (side by side)',
    table(
      ['scope', baseline.metadata.strategyId, candidate.metadata.strategyId, 'delta'],
      scopes.flatMap(([label, left, right]) => [
        [label, '', '', ''],
        row('median wait', left.waitSeconds.median, right.waitSeconds.median, duration),
        row('p95 wait', left.waitSeconds.p95, right.waitSeconds.p95, duration),
        row('max wait', left.waitSeconds.max, right.waitSeconds.max, duration),
        row('never matched', left.unmatched.rate, right.unmatched.rate, percent),
        row('pod 3', podRate(left, '3'), podRate(right, '3'), percent),
        row('pod 4', podRate(left, '4'), podRate(right, '4'), percent),
        row('pod 5', podRate(left, '5'), podRate(right, '5'), percent),
        row('preferred', left.assignment.preferredRate, right.assignment.preferredRate, percent),
        row('immediate rematch', left.immediateRematch.rate, right.immediateRematch.rate, percent),
        row('requeue', left.requeue.rate, right.requeue.rate, percent),
        row('table util', left.tables.utilisation, right.tables.utilisation, percent),
        row('invariants', left.invariantFailures, right.invariantFailures, (value) => String(value)),
      ]),
    ),
  ];
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

function podRate(summary: BenchmarkMetricSummary, size: string): number {
  const total = Object.values(summary.podDistribution).reduce((sum, count) => sum + count, 0);
  return total === 0 ? 0 : (summary.podDistribution[size] ?? 0) / total;
}

function emptySummary(): BenchmarkMetricSummary {
  return {
    nights: 0,
    participants: 0,
    runtimeMs: 0,
    waitSeconds: { count: 0, median: 0, p95: 0, max: 0 },
    unmatched: { participants: 0, rate: 0 },
    assignment: { seats: 0, preferred: 0, preferredRate: 0, secondary: 0, secondaryRate: 0 },
    immediateRematch: { pairs: 0, rate: 0 },
    podDistribution: {},
    requeue: { count: 0, decisions: 0, rate: 0 },
    tables: { occupiedSeconds: 0, availableSeconds: 0, utilisation: 0 },
    invariantFailures: 0,
  };
}

function row(
  label: string,
  baseline: number,
  candidate: number,
  format: (value: number) => string,
): [string, string, string, string] {
  return [
    `  ${label}`,
    format(baseline),
    format(candidate),
    `${candidate - baseline >= 0 ? '+' : ''}${format(candidate - baseline)}`,
  ];
}

function duration(seconds: number): string {
  return `${(seconds / 60).toFixed(2)}m`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const line = (values: readonly string[]) =>
    values.map((value, index) => value.padEnd(widths[index] ?? value.length)).join('  ').trimEnd();
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
}
