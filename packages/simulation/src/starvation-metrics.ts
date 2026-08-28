import {
  distributionMetrics,
  type DistributionMetrics,
  type EventMetricRecord,
  type MetricParticipant,
} from './metrics.js';

export const STARVATION_WAIT_THRESHOLDS = [
  300,
  600,
  900,
  1_800,
  3_600,
] as const;

export type StarvationGroupSummary = {
  participants: number;
  queueCycles: number;
  fullWaitSeconds: DistributionMetrics;
  matchedWaitSeconds: DistributionMetrics;
  eventuallyMatched: { count: number; rate: number };
  neverMatched: { count: number; rate: number };
};

export type StarvationMetricSummary = {
  participantMetadataMissing: number;
  all: StarvationGroupSummary;
  exclusivePools: Readonly<Record<'B2' | 'B3' | 'B4', StarvationGroupSummary>>;
  worstExclusivePool: {
    over30Minutes: { poolId: 'B2' | 'B3' | 'B4'; rate: number };
    over60Minutes: { poolId: 'B2' | 'B3' | 'B4'; rate: number };
    neverMatched: { poolId: 'B2' | 'B3' | 'B4'; rate: number };
  };
};

/**
 * "Still waiting after T" is a queue-cycle survival rate: every READY queue
 * episode is included, regardless of whether it later matched, paused, left,
 * or reached event close. This avoids the survivor bias of matched-only waits.
 */
export function aggregateStarvationMetrics(
  records: readonly EventMetricRecord[],
): StarvationMetricSummary {
  const entries = records.flatMap((record) =>
    record.participants.map((participant) => ({ record, participant })),
  );
  const withMetadata = entries.filter(
    ({ participant }) => participant.acceptedPoolIds !== undefined,
  );
  const exclusiveByPool = Object.fromEntries(
    (['B2', 'B3', 'B4'] as const).map((poolId) => [
      poolId,
      groupSummary(
        withMetadata.filter(
          ({ participant }) =>
            acceptedPools(participant).length === 1 &&
            acceptedPools(participant)[0] === poolId,
        ),
      ),
    ]),
  ) as StarvationMetricSummary['exclusivePools'];

  return {
    participantMetadataMissing: entries.length - withMetadata.length,
    all: groupSummary(withMetadata),
    exclusivePools: exclusiveByPool,
    worstExclusivePool: {
      over30Minutes: worstPool(exclusiveByPool, (summary) =>
        thresholdRate(summary, 1_800),
      ),
      over60Minutes: worstPool(exclusiveByPool, (summary) =>
        thresholdRate(summary, 3_600),
      ),
      neverMatched: worstPool(
        exclusiveByPool,
        (summary) => summary.neverMatched.rate,
      ),
    },
  };
}

type ParticipantRecord = {
  record: EventMetricRecord;
  participant: MetricParticipant;
};

function groupSummary(
  entries: readonly ParticipantRecord[],
): StarvationGroupSummary {
  const idsByRecord = new Map<EventMetricRecord, Set<string>>();
  for (const entry of entries) {
    const ids = idsByRecord.get(entry.record) ?? new Set<string>();
    ids.add(entry.participant.id);
    idsByRecord.set(entry.record, ids);
  }
  const cycles = [...idsByRecord].flatMap(([record, ids]) =>
    record.queueCycles.filter((cycle) => ids.has(cycle.participantId)),
  );
  const fullWaits = cycles.map((cycle) => cycle.endedAt - cycle.startedAt);
  const matchedWaits = cycles
    .filter((cycle) => cycle.reason === 'matched')
    .map((cycle) => cycle.endedAt - cycle.startedAt);
  const eventuallyMatched = entries.filter(({ record, participant }) =>
    record.games.some((game) =>
      game.seats.some((seat) => seat.participantId === participant.id),
    ),
  ).length;
  return {
    participants: entries.length,
    queueCycles: cycles.length,
    fullWaitSeconds: distributionMetrics(
      fullWaits,
      STARVATION_WAIT_THRESHOLDS,
    ),
    matchedWaitSeconds: distributionMetrics(
      matchedWaits,
      STARVATION_WAIT_THRESHOLDS,
    ),
    eventuallyMatched: {
      count: eventuallyMatched,
      rate: divide(eventuallyMatched, entries.length),
    },
    neverMatched: {
      count: entries.length - eventuallyMatched,
      rate: divide(entries.length - eventuallyMatched, entries.length),
    },
  };
}

function worstPool(
  pools: StarvationMetricSummary['exclusivePools'],
  value: (summary: StarvationGroupSummary) => number,
): { poolId: 'B2' | 'B3' | 'B4'; rate: number } {
  return (Object.entries(pools) as Array<
    ['B2' | 'B3' | 'B4', StarvationGroupSummary]
  >)
    .map(([poolId, summary]) => ({ poolId, rate: value(summary) }))
    .sort(
      (left, right) =>
        right.rate - left.rate || left.poolId.localeCompare(right.poolId),
    )[0]!;
}

function thresholdRate(
  summary: StarvationGroupSummary,
  threshold: number,
): number {
  return summary.fullWaitSeconds.overThresholdRate[String(threshold)] ?? 0;
}

function acceptedPools(participant: MetricParticipant): string[] {
  return [...new Set(participant.acceptedPoolIds ?? [])];
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
