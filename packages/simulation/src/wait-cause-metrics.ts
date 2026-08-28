import {
  nearestRankPercentile,
  type EventMetricRecord,
  type MetricParticipant,
  type MetricQueueCycle,
  type MetricWaitCauseSeconds,
} from './metrics.js';
import {
  emptyWaitCauseSeconds,
  totalWaitCauseSeconds,
  type ConnectorLockoutEvent,
  type WaitCauseInterval,
  type WaitCauseKind,
} from './wait-cause.js';

export type WaitCauseShare = MetricWaitCauseSeconds & {
  total: number;
  percent: {
    structuralScarcity: number;
    tableCapacity: number;
    matcherChoice: number;
    connectorLockoutOtherPool: number;
    connectorLockoutSamePool: number;
    connectorLockout: number;
    opportunityGrace: number;
    unknown: number;
  };
};

export type AddressableWaitSummary = {
  meanMinutesPerAttendee: number;
  p95Minutes: number;
  attendeesWithOver5Minutes: number;
  attendeeCount: number;
  over5MinuteRate: number;
};

export type ConnectorLockoutSummary = {
  events: number;
  totalMinutes: number;
  durationSeconds: { p50: number; p95: number; max: number };
  affectedAttendeeNights: number;
  eventsWhereAnotherConnectorArrivedFirst: number;
  byWaitingPool: Readonly<Record<string, { events: number; minutes: number }>>;
};

export type WaitCauseCycleReplay = {
  participantId: string;
  preferredPoolId?: string;
  acceptedPoolIds?: readonly string[];
  exclusivePoolId?: string;
  cycle: number;
  startedAt: number;
  endedAt: number;
  waitSeconds: number;
  reason: string;
  causes: MetricWaitCauseSeconds;
  intervals: readonly WaitCauseInterval[];
};

const SEVERE_THRESHOLDS = [300, 600, 1_800, 3_600] as const;

export function addCauseSeconds(
  target: MetricWaitCauseSeconds,
  source: MetricWaitCauseSeconds,
): void {
  target.structuralScarcity += source.structuralScarcity;
  target.tableCapacity += source.tableCapacity;
  target.matcherChoice += source.matcherChoice;
  target.connectorLockoutOtherPool += source.connectorLockoutOtherPool;
  target.connectorLockoutSamePool += source.connectorLockoutSamePool;
  target.opportunityGrace += source.opportunityGrace;
  target.unknown += source.unknown;
}

export function waitCauseShare(seconds: MetricWaitCauseSeconds): WaitCauseShare {
  const total = totalWaitCauseSeconds(seconds);
  const pct = (value: number) => (total === 0 ? 0 : value / total);
  const connectorLockout =
    seconds.connectorLockoutOtherPool + seconds.connectorLockoutSamePool;
  return {
    ...seconds,
    total,
    percent: {
      structuralScarcity: pct(seconds.structuralScarcity),
      tableCapacity: pct(seconds.tableCapacity),
      matcherChoice: pct(seconds.matcherChoice),
      connectorLockoutOtherPool: pct(seconds.connectorLockoutOtherPool),
      connectorLockoutSamePool: pct(seconds.connectorLockoutSamePool),
      connectorLockout: pct(connectorLockout),
      opportunityGrace: pct(seconds.opportunityGrace),
      unknown: pct(seconds.unknown),
    },
  };
}

export function aggregateWaitCauses(
  records: readonly EventMetricRecord[],
): {
  global: WaitCauseShare;
  byMinWait: Readonly<Record<'5m' | '10m' | '30m' | '60m', WaitCauseShare>>;
  exclusive: Readonly<Record<'B2' | 'B3' | 'B4', WaitCauseShare>>;
  exclusiveB4Over30m: WaitCauseShare;
  exclusiveB4Over60m: WaitCauseShare;
  directlyAddressable: AddressableWaitSummary;
  potentiallyAddressable: AddressableWaitSummary;
  connectorLockoutOtherPool: ConnectorLockoutSummary;
  accountingFailures: number;
} {
  const global = emptyWaitCauseSeconds();
  const byMinWait = {
    '5m': emptyWaitCauseSeconds(),
    '10m': emptyWaitCauseSeconds(),
    '30m': emptyWaitCauseSeconds(),
    '60m': emptyWaitCauseSeconds(),
  };
  const exclusive = {
    B2: emptyWaitCauseSeconds(),
    B3: emptyWaitCauseSeconds(),
    B4: emptyWaitCauseSeconds(),
  };
  const exclusiveB4Over30m = emptyWaitCauseSeconds();
  const exclusiveB4Over60m = emptyWaitCauseSeconds();
  const directByAttendee: number[] = [];
  const potentialByAttendee: number[] = [];
  let accountingFailures = 0;

  for (const record of records) {
    const byParticipant = new Map<string, { direct: number; potential: number }>();
    for (const participant of record.participants) {
      byParticipant.set(participant.id, { direct: 0, potential: 0 });
    }
    for (const cycle of record.queueCycles) {
      const causes = cycle.waitCauses ?? emptyWaitCauseSeconds();
      const duration = cycle.endedAt - cycle.startedAt;
      if (Math.abs(totalWaitCauseSeconds(causes) - duration) > 0) {
        accountingFailures += 1;
      }
      addCauseSeconds(global, causes);
      if (duration > 300) addCauseSeconds(byMinWait['5m'], causes);
      if (duration > 600) addCauseSeconds(byMinWait['10m'], causes);
      if (duration > 1_800) addCauseSeconds(byMinWait['30m'], causes);
      if (duration > 3_600) addCauseSeconds(byMinWait['60m'], causes);
      const exclusivePool = exclusivePoolId(
        record.participants.find((participant) => participant.id === cycle.participantId),
      );
      if (exclusivePool === 'B2' || exclusivePool === 'B3' || exclusivePool === 'B4') {
        addCauseSeconds(exclusive[exclusivePool], causes);
        if (exclusivePool === 'B4' && duration > 1_800) {
          addCauseSeconds(exclusiveB4Over30m, causes);
        }
        if (exclusivePool === 'B4' && duration > 3_600) {
          addCauseSeconds(exclusiveB4Over60m, causes);
        }
      }
      const attendee = byParticipant.get(cycle.participantId);
      if (attendee) {
        attendee.direct += causes.matcherChoice;
        attendee.potential +=
          causes.matcherChoice + causes.connectorLockoutOtherPool;
      }
    }
    for (const attendee of byParticipant.values()) {
      directByAttendee.push(attendee.direct);
      potentialByAttendee.push(attendee.potential);
    }
  }

  return {
    global: waitCauseShare(global),
    byMinWait: {
      '5m': waitCauseShare(byMinWait['5m']),
      '10m': waitCauseShare(byMinWait['10m']),
      '30m': waitCauseShare(byMinWait['30m']),
      '60m': waitCauseShare(byMinWait['60m']),
    },
    exclusive: {
      B2: waitCauseShare(exclusive.B2),
      B3: waitCauseShare(exclusive.B3),
      B4: waitCauseShare(exclusive.B4),
    },
    exclusiveB4Over30m: waitCauseShare(exclusiveB4Over30m),
    exclusiveB4Over60m: waitCauseShare(exclusiveB4Over60m),
    directlyAddressable: addressableSummary(directByAttendee),
    potentiallyAddressable: addressableSummary(potentialByAttendee),
    connectorLockoutOtherPool: summarizeLockouts(
      records.flatMap((record) =>
        (record.connectorLockoutEvents ?? []).map((event) => ({
          ...event,
          nightKey: `${record.scenarioId}:${record.seed}:${event.waitingParticipantId}`,
        })),
      ),
    ),
    accountingFailures,
  };
}

export function replaySevereExclusiveCycles(
  record: EventMetricRecord,
  poolId: string,
  minWaitSeconds = 1_800,
): WaitCauseCycleReplay[] {
  return record.queueCycles
    .filter((cycle) => {
      const participant = record.participants.find(
        (entry) => entry.id === cycle.participantId,
      );
      return (
        exclusivePoolId(participant) === poolId &&
        cycle.endedAt - cycle.startedAt >= minWaitSeconds
      );
    })
    .map((cycle) => toReplay(record, cycle))
    .sort(
      (left, right) =>
        right.waitSeconds - left.waitSeconds ||
        left.startedAt - right.startedAt ||
        left.participantId.localeCompare(right.participantId),
    );
}

export function replayParticipantCycles(
  record: EventMetricRecord,
  participantId: string,
): WaitCauseCycleReplay[] {
  return record.queueCycles
    .filter((cycle) => cycle.participantId === participantId)
    .map((cycle) => toReplay(record, cycle));
}

function toReplay(
  record: EventMetricRecord,
  cycle: MetricQueueCycle,
): WaitCauseCycleReplay {
  const participant = record.participants.find(
    (entry) => entry.id === cycle.participantId,
  );
  return {
    participantId: cycle.participantId,
    preferredPoolId: participant?.preferredPoolId,
    acceptedPoolIds: participant?.acceptedPoolIds,
    exclusivePoolId: exclusivePoolId(participant),
    cycle: cycle.cycle,
    startedAt: cycle.startedAt,
    endedAt: cycle.endedAt,
    waitSeconds: cycle.endedAt - cycle.startedAt,
    reason: cycle.reason,
    causes: cycle.waitCauses ?? emptyWaitCauseSeconds(),
    intervals: cycle.waitCauseIntervals ?? [],
  };
}

function exclusivePoolId(
  participant: MetricParticipant | undefined,
): string | undefined {
  const pools = participant?.acceptedPoolIds;
  if (!pools || pools.length !== 1) return undefined;
  return pools[0];
}

function addressableSummary(seconds: readonly number[]): AddressableWaitSummary {
  const sorted = [...seconds].sort((left, right) => left - right);
  const over5 = sorted.filter((value) => value > 300).length;
  return {
    meanMinutesPerAttendee: (sorted.reduce((sum, value) => sum + value, 0) / 60) /
      Math.max(1, sorted.length),
    p95Minutes: (sorted.length === 0 ? 0 : nearestRankPercentile(sorted, 0.95)) / 60,
    attendeesWithOver5Minutes: over5,
    attendeeCount: sorted.length,
    over5MinuteRate: sorted.length === 0 ? 0 : over5 / sorted.length,
  };
}

function summarizeLockouts(
  events: ReadonlyArray<ConnectorLockoutEvent & { nightKey?: string }>,
): ConnectorLockoutSummary {
  const durations = events.map((event) => event.durationSeconds).sort((left, right) => left - right);
  const byWaitingPool: Record<string, { events: number; minutes: number }> = {};
  const attendeeNights = new Set(
    events.map(
      (event) => event.nightKey ?? event.waitingParticipantId,
    ),
  );
  for (const event of events) {
    const bucket = byWaitingPool[event.waitingPoolId] ?? { events: 0, minutes: 0 };
    bucket.events += 1;
    bucket.minutes += event.durationSeconds / 60;
    byWaitingPool[event.waitingPoolId] = bucket;
  }
  return {
    events: events.length,
    totalMinutes: events.reduce((sum, event) => sum + event.durationSeconds, 0) / 60,
    durationSeconds: {
      p50: durations.length === 0 ? 0 : nearestRankPercentile(durations, 0.5),
      p95: durations.length === 0 ? 0 : nearestRankPercentile(durations, 0.95),
      max: durations[durations.length - 1] ?? 0,
    },
    affectedAttendeeNights: attendeeNights.size,
    eventsWhereAnotherConnectorArrivedFirst: events.filter(
      (event) => event.anotherConnectorBecameReadyBeforeReturn,
    ).length,
    byWaitingPool,
  };
}

export { SEVERE_THRESHOLDS };
export type { WaitCauseKind };
