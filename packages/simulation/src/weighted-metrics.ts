import type { EventMetricRecord } from './metrics.js';

export type WeightedDecisionSummary = {
  scoredDecisions: number;
  changedFromFrozenControl: number;
  secondaryPoolReallocations: number;
  decisionsSeatingFewerImmediately: number;
  totalImmediateSeatsForgone: number;
  exclusiveParticipantsUnlocked: number;
  averageSelectedScoreMargin: number;
  changedByImmediateSeatDelta: {
    moreSeats: number;
    sameSeats: number;
    minusOneSeat: number;
    minusTwoOrWorse: number;
  };
  generator: {
    decisionsEvaluated: number;
    singleCandidatesGenerated: number;
    pairCandidatesGenerated: number;
    uniqueCandidatesAfterDeduplication: number;
    decisionsWherePairwiseAddsNoNewPlan: number;
    decisionsChangedFromSingleGenerator: number;
    selectedPlansRequiringTwoForces: number;
    decisionsGainingSeatsVsSingle: number;
    decisionsLosingSeatsVsSingle: number;
    immediateSeatsGainedVsSingle: number;
    immediateSeatsLostVsSingle: number;
    pairwiseSelectedExclusiveParticipantsUnlocked: number;
    candidateCountP50: number;
    candidateCountP95: number;
    candidateCountMax: number;
    totalMatcherEvaluations: number;
    ceilingHits: number;
    truncatedSingleAssignments: number;
    truncatedPairAssignments: number;
  };
};

export function aggregateWeightedDecisions(
  records: readonly EventMetricRecord[],
): WeightedDecisionSummary {
  const decisions = records.flatMap(
    (record) => record.weightedDecisions ?? [],
  );
  const changed = decisions.filter(
    (decision) => decision.changedFromControl,
  );
  const candidateCounts = decisions
    .map(
      (decision) =>
        decision.generator?.uniqueCandidatesAfterDeduplication ??
        decision.candidates.length,
    )
    .sort((left, right) => left - right);
  const changedFromSingle = decisions.filter(
    (decision) => decision.changedFromSingleGenerator,
  );
  const requiringPair = decisions.filter(
    (decision) => decision.selectedRequiresTwoForces,
  );
  return {
    scoredDecisions: decisions.length,
    changedFromFrozenControl: changed.length,
    secondaryPoolReallocations: changed.filter(
      (decision) => decision.secondaryPoolReallocation,
    ).length,
    decisionsSeatingFewerImmediately: changed.filter(
      (decision) => decision.immediateSeatDelta < 0,
    ).length,
    totalImmediateSeatsForgone: changed.reduce(
      (sum, decision) =>
        sum + Math.max(0, -decision.immediateSeatDelta),
      0,
    ),
    exclusiveParticipantsUnlocked: changed.reduce(
      (sum, decision) =>
        sum + decision.exclusiveParticipantsUnlocked,
      0,
    ),
    averageSelectedScoreMargin: divide(
      decisions.reduce((sum, decision) => sum + decision.scoreMargin, 0),
      decisions.length,
    ),
    changedByImmediateSeatDelta: {
      moreSeats: changed.filter(
        (decision) => decision.immediateSeatDelta > 0,
      ).length,
      sameSeats: changed.filter(
        (decision) => decision.immediateSeatDelta === 0,
      ).length,
      minusOneSeat: changed.filter(
        (decision) => decision.immediateSeatDelta === -1,
      ).length,
      minusTwoOrWorse: changed.filter(
        (decision) => decision.immediateSeatDelta <= -2,
      ).length,
    },
    generator: {
      decisionsEvaluated: decisions.length,
      singleCandidatesGenerated: decisions.reduce(
        (sum, decision) =>
          sum + (decision.generator?.singleCandidatesGenerated ?? 0),
        0,
      ),
      pairCandidatesGenerated: decisions.reduce(
        (sum, decision) =>
          sum + (decision.generator?.pairCandidatesGenerated ?? 0),
        0,
      ),
      uniqueCandidatesAfterDeduplication: decisions.reduce(
        (sum, decision) =>
          sum +
          (decision.generator?.uniqueCandidatesAfterDeduplication ??
            decision.candidates.length),
        0,
      ),
      decisionsWherePairwiseAddsNoNewPlan: decisions.filter(
        (decision) =>
          decision.generator?.mode === 'pairwise' &&
          decision.generator.pairCandidatesGenerated === 0,
      ).length,
      decisionsChangedFromSingleGenerator: changedFromSingle.length,
      selectedPlansRequiringTwoForces: requiringPair.length,
      decisionsGainingSeatsVsSingle: changedFromSingle.filter(
        (decision) => decision.immediateSeatDeltaVsSingleGenerator > 0,
      ).length,
      decisionsLosingSeatsVsSingle: changedFromSingle.filter(
        (decision) => decision.immediateSeatDeltaVsSingleGenerator < 0,
      ).length,
      immediateSeatsGainedVsSingle: changedFromSingle.reduce(
        (sum, decision) =>
          sum + Math.max(0, decision.immediateSeatDeltaVsSingleGenerator),
        0,
      ),
      immediateSeatsLostVsSingle: changedFromSingle.reduce(
        (sum, decision) =>
          sum + Math.max(0, -decision.immediateSeatDeltaVsSingleGenerator),
        0,
      ),
      pairwiseSelectedExclusiveParticipantsUnlocked: requiringPair.reduce(
        (sum, decision) =>
          sum + decision.exclusiveParticipantsUnlocked,
        0,
      ),
      candidateCountP50: percentile(candidateCounts, 0.5),
      candidateCountP95: percentile(candidateCounts, 0.95),
      candidateCountMax: candidateCounts.at(-1) ?? 0,
      totalMatcherEvaluations: decisions.reduce(
        (sum, decision) =>
          sum + (decision.generator?.matcherEvaluations ?? 0),
        0,
      ),
      ceilingHits: decisions.filter(
        (decision) => decision.generator?.ceilingReached,
      ).length,
      truncatedSingleAssignments: decisions.reduce(
        (sum, decision) =>
          sum + (decision.generator?.truncatedSingleAssignments ?? 0),
        0,
      ),
      truncatedPairAssignments: decisions.reduce(
        (sum, decision) =>
          sum + (decision.generator?.truncatedPairAssignments ?? 0),
        0,
      ),
    },
  };
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  return values[Math.floor((values.length - 1) * quantile)] ?? 0;
}
