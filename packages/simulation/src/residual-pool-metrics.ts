import type { EventMetricRecord } from './metrics.js';
import type {
  ResidualPoolDiagnostics,
  WeightedCandidateExplanation,
} from './weighted-strategy.js';

export type ResidualPoolComparisonSummary = {
  changedDecisions: number;
  selectedLeavesFewerExclusiveParticipants: number;
  selectedLeavesMoreExclusiveParticipants: number;
  selectedLeavesFewerOneShortPools: number;
  selectedLeavesMoreOneShortPools: number;
  selectedLeavesFewerThinPools: number;
  selectedLeavesMoreThinPools: number;
  selectedReducesOldestExclusiveWaitByPool: number;
  selectedIncreasesOldestExclusiveWaitByPool: number;
  meanDelta: {
    unmatchedReady: number;
    exclusiveRemaining: number;
    multiPoolRemaining: number;
    connectorRemaining: number;
    oneShortPools: number;
    thinPools: number;
    summedOldestExclusiveWaitSeconds: number;
  };
};

export function aggregateResidualPoolComparisons(
  records: readonly EventMetricRecord[],
): ResidualPoolComparisonSummary {
  const comparisons = records.flatMap((record) =>
    (record.weightedDecisions ?? [])
      .filter((decision) => decision.changedFromSingleGenerator)
      .flatMap((decision) => {
        const selected = decision.candidates.find(
          (candidate) => candidate.selected,
        );
        const single = decision.candidates.find(
          (candidate) =>
            candidate.key ===
            decision.singleGeneratorSelectedCandidateKey,
        );
        return selected && single ? [{ selected, single }] : [];
      }),
  );
  const deltas = comparisons.map(({ selected, single }) =>
    residualDelta(selected, single),
  );
  return {
    changedDecisions: comparisons.length,
    selectedLeavesFewerExclusiveParticipants: deltas.filter(
      (delta) => delta.exclusiveRemaining < 0,
    ).length,
    selectedLeavesMoreExclusiveParticipants: deltas.filter(
      (delta) => delta.exclusiveRemaining > 0,
    ).length,
    selectedLeavesFewerOneShortPools: deltas.filter(
      (delta) => delta.oneShortPools < 0,
    ).length,
    selectedLeavesMoreOneShortPools: deltas.filter(
      (delta) => delta.oneShortPools > 0,
    ).length,
    selectedLeavesFewerThinPools: deltas.filter(
      (delta) => delta.thinPools < 0,
    ).length,
    selectedLeavesMoreThinPools: deltas.filter(
      (delta) => delta.thinPools > 0,
    ).length,
    selectedReducesOldestExclusiveWaitByPool: deltas.filter(
      (delta) => delta.summedOldestExclusiveWaitSeconds < 0,
    ).length,
    selectedIncreasesOldestExclusiveWaitByPool: deltas.filter(
      (delta) => delta.summedOldestExclusiveWaitSeconds > 0,
    ).length,
    meanDelta: {
      unmatchedReady: mean(deltas.map((delta) => delta.unmatchedReady)),
      exclusiveRemaining: mean(
        deltas.map((delta) => delta.exclusiveRemaining),
      ),
      multiPoolRemaining: mean(
        deltas.map((delta) => delta.multiPoolRemaining),
      ),
      connectorRemaining: mean(
        deltas.map((delta) => delta.connectorRemaining),
      ),
      oneShortPools: mean(deltas.map((delta) => delta.oneShortPools)),
      thinPools: mean(deltas.map((delta) => delta.thinPools)),
      summedOldestExclusiveWaitSeconds: mean(
        deltas.map((delta) => delta.summedOldestExclusiveWaitSeconds),
      ),
    },
  };
}

function residualDelta(
  selected: WeightedCandidateExplanation,
  single: WeightedCandidateExplanation,
) {
  const selectedResidual = selected.residual;
  const singleResidual = single.residual;
  return {
    unmatchedReady:
      selectedResidual.unmatchedReadyCount -
      singleResidual.unmatchedReadyCount,
    exclusiveRemaining:
      selectedResidual.exclusiveParticipantsRemaining -
      singleResidual.exclusiveParticipantsRemaining,
    multiPoolRemaining:
      selectedResidual.multiPoolParticipantsRemaining -
      singleResidual.multiPoolParticipantsRemaining,
    connectorRemaining:
      selectedResidual.multiPoolConnectorsRemaining -
      singleResidual.multiPoolConnectorsRemaining,
    oneShortPools:
      countOneShort(selectedResidual) - countOneShort(singleResidual),
    thinPools: countThin(selectedResidual) - countThin(singleResidual),
    summedOldestExclusiveWaitSeconds:
      sumOldestExclusive(selectedResidual) -
      sumOldestExclusive(singleResidual),
  };
}

function countOneShort(residual: ResidualPoolDiagnostics): number {
  return residual.pools.filter(
    (pool) => pool.exactlyOneShortOfMinimumPod,
  ).length;
}

function countThin(residual: ResidualPoolDiagnostics): number {
  return residual.pools.filter((pool) => pool.cannotFormMinimumPod).length;
}

function sumOldestExclusive(residual: ResidualPoolDiagnostics): number {
  return residual.pools.reduce(
    (sum, pool) => sum + pool.oldestExclusiveWaitSeconds,
    0,
  );
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
