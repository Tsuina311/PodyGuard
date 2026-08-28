import {
  distributionMetrics,
  type DistributionMetrics,
  type EventMetricRecord,
  type MetricParticipant,
} from './metrics.js';

const WAIT_THRESHOLDS = [300, 600, 900, 1_800] as const;

export type ScarcityParticipantSummary = {
  participants: number;
  matchedWait: DistributionMetrics;
  neverMatched: { count: number; rate: number };
};

export type ScarcityDiagnosticSummary = {
  missedScarcePoolUnlocks: number;
  scarcityRedirects: number;
  scarcityReallocations: number;
  zeroSeatLossRedirects: number;
  oneSeatLossRedirects: number;
  totalImmediateSeatsSacrificed: number;
  exclusiveParticipantsNewlySeatedThroughSeatLoss: number;
  redirectsByScarcePool: Readonly<Record<string, number>>;
  oneSeatLossRedirectsByScarcePool: Readonly<Record<string, number>>;
  oneSeatLossRedirectsByControlPool: Readonly<Record<string, number>>;
  opportunityCount: number;
  missedRate: number;
  scarcityDrivenSecondaryAssignments: number;
  uniqueScarcityReallocatedParticipants: number;
  immediateSeatingReductions: number;
};

export type ScarcityMetricSummary = {
  nights: number;
  participantMetadataMissing: number;
  exclusive: ScarcityParticipantSummary;
  multiPool: ScarcityParticipantSummary;
  pools: Readonly<Record<string, ScarcityParticipantSummary>>;
  b4Compatible: ScarcityParticipantSummary;
  b4Exclusive: ScarcityParticipantSummary;
  assignments: {
    seats: number;
    preferred: { count: number; rate: number };
    secondary: { count: number; rate: number };
    secondaryPerEvent: number;
  };
  diagnostics: ScarcityDiagnosticSummary;
};

/**
 * Pool-compatible summaries include a multi-pool participant in every pool
 * they explicitly accepted. Exclusive/multi-pool cuts are disjoint. Older
 * artifacts without participant pool metadata are counted as unavailable,
 * never inferred.
 */
export function aggregateScarcityMetrics(
  records: readonly EventMetricRecord[],
): ScarcityMetricSummary {
  const participants = records.flatMap((record) =>
    record.participants.map((participant) => ({ record, participant })),
  );
  const withMetadata = participants.filter(
    (entry) =>
      entry.participant.acceptedPoolIds !== undefined &&
      entry.participant.preferredPoolId !== undefined,
  );
  const exclusive = withMetadata.filter(
    (entry) => acceptedPools(entry.participant).length === 1,
  );
  const multiPool = withMetadata.filter(
    (entry) => acceptedPools(entry.participant).length > 1,
  );
  const poolIds = [
    ...new Set(
      withMetadata.flatMap((entry) => acceptedPools(entry.participant)),
    ),
  ].sort();
  const pools = Object.fromEntries(
    poolIds.map((poolId) => [
      poolId,
      participantSummary(
        withMetadata.filter((entry) =>
          acceptedPools(entry.participant).includes(poolId),
        ),
      ),
    ]),
  );
  const seats = records.flatMap((record) =>
    record.games.flatMap((game) => game.seats),
  );
  const preferred = seats.filter(
    (seat) => seat.assignedPoolId === seat.preferredPoolId,
  ).length;
  const secondary = seats.filter(
    (seat) =>
      seat.assignedPoolId !== seat.preferredPoolId &&
      seat.acceptedPoolIds.includes(seat.assignedPoolId),
  ).length;
  const diagnostics = records.flatMap(
    (record) => record.scarcityDiagnostics ?? [],
  );
  const missed = diagnostics.filter(
    (diagnostic) => diagnostic.type === 'MISSED_SCARCE_POOL_UNLOCK',
  ).length;
  const reallocations = diagnostics.filter(
    (diagnostic) => diagnostic.type === 'SCARCITY_REALLOCATION',
  );
  const oneSeatLossReallocations = diagnostics.filter(
    (diagnostic) =>
      diagnostic.type === 'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION',
  );
  const allReallocations = [...reallocations, ...oneSeatLossReallocations];
  const redirectsByScarcePool = countBy(
    allReallocations.map((diagnostic) => diagnostic.scarcePoolId),
  );
  const oneSeatLossRedirectsByScarcePool = countBy(
    oneSeatLossReallocations.map(
      (diagnostic) => diagnostic.scarcePoolId,
    ),
  );
  const oneSeatLossRedirectsByControlPool = countBy(
    oneSeatLossReallocations.flatMap((diagnostic) =>
      diagnostic.controlPoolId ? [diagnostic.controlPoolId] : [],
    ),
  );
  const uniqueReallocatedParticipants = new Set(
    records.flatMap((record) =>
      (record.scarcityDiagnostics ?? [])
        .filter(
          (diagnostic) =>
            diagnostic.type === 'SCARCITY_REALLOCATION' ||
            diagnostic.type ===
              'SCARCITY_BOUNDED_SEAT_LOSS_REALLOCATION',
        )
        .map(
          (diagnostic) =>
            `${record.scenarioId}\0${record.seed}\0${diagnostic.participantId}`,
        ),
    ),
  ).size;

  return {
    nights: records.length,
    participantMetadataMissing: participants.length - withMetadata.length,
    exclusive: participantSummary(exclusive),
    multiPool: participantSummary(multiPool),
    pools,
    b4Compatible: participantSummary(
      withMetadata.filter((entry) =>
        acceptedPools(entry.participant).includes('B4'),
      ),
    ),
    b4Exclusive: participantSummary(
      exclusive.filter(
        (entry) => acceptedPools(entry.participant)[0] === 'B4',
      ),
    ),
    assignments: {
      seats: seats.length,
      preferred: { count: preferred, rate: divide(preferred, seats.length) },
      secondary: { count: secondary, rate: divide(secondary, seats.length) },
      secondaryPerEvent: divide(secondary, records.length),
    },
    diagnostics: {
      missedScarcePoolUnlocks: missed,
      scarcityRedirects: allReallocations.length,
      scarcityReallocations: reallocations.length,
      zeroSeatLossRedirects: reallocations.length,
      oneSeatLossRedirects: oneSeatLossReallocations.length,
      totalImmediateSeatsSacrificed: oneSeatLossReallocations.reduce(
        (sum, diagnostic) => sum + (diagnostic.immediateSeatLoss ?? 0),
        0,
      ),
      exclusiveParticipantsNewlySeatedThroughSeatLoss:
        oneSeatLossReallocations.reduce(
          (sum, diagnostic) =>
            sum +
            (diagnostic.newlySeatedExclusiveParticipantIds?.length ?? 0),
          0,
        ),
      redirectsByScarcePool,
      oneSeatLossRedirectsByScarcePool,
      oneSeatLossRedirectsByControlPool,
      opportunityCount: missed + allReallocations.length,
      missedRate: divide(missed, missed + allReallocations.length),
      scarcityDrivenSecondaryAssignments: allReallocations.filter(
        (diagnostic) =>
          diagnostic.explicitlyAccepted &&
          diagnostic.preferredPoolId !== diagnostic.scarcePoolId,
      ).length,
      uniqueScarcityReallocatedParticipants: uniqueReallocatedParticipants,
      immediateSeatingReductions: allReallocations.filter(
        (diagnostic) =>
          diagnostic.candidateSeatedCount < diagnostic.baselineSeatedCount,
      ).length,
    },
  };
}

type ParticipantRecord = {
  record: EventMetricRecord;
  participant: MetricParticipant;
};

function participantSummary(
  entries: readonly ParticipantRecord[],
): ScarcityParticipantSummary {
  const idsByRecord = new Map<EventMetricRecord, Set<string>>();
  for (const entry of entries) {
    const ids = idsByRecord.get(entry.record) ?? new Set<string>();
    ids.add(entry.participant.id);
    idsByRecord.set(entry.record, ids);
  }
  const waits = [...idsByRecord].flatMap(([record, ids]) =>
    record.queueCycles
      .filter(
        (cycle) => cycle.reason === 'matched' && ids.has(cycle.participantId),
      )
      .map((cycle) => cycle.endedAt - cycle.startedAt),
  );
  const neverMatched = entries.filter(({ record, participant }) =>
    record.games.every((game) =>
      game.seats.every((seat) => seat.participantId !== participant.id),
    ),
  ).length;
  return {
    participants: entries.length,
    matchedWait: distributionMetrics(waits, WAIT_THRESHOLDS),
    neverMatched: {
      count: neverMatched,
      rate: divide(neverMatched, entries.length),
    },
  };
}

function acceptedPools(participant: MetricParticipant): string[] {
  return [...new Set(participant.acceptedPoolIds ?? [])];
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}
