/**
 * Diagnostic wait-cause classification for READY queue time.
 *
 * This does not change matchmaking. It attributes already-elapsed wait to
 * mutually exclusive causes using current READY/PLAYING/table state only.
 *
 * Legal-pod test (cheap, no combinatorial search):
 * a participant can form a legal pod iff at least one explicitly accepted pool
 * has >= min(allowedSizes) currently READY compatible players, including them.
 *
 * Precedence (first match wins):
 * 1. A legal READY pod exists that is not currently grace-delayed
 *    → TABLE_CAPACITY if no free table, else MATCHER_CHOICE
 * 2. The only legal READY pods containing them are opportunity-grace delayed
 *    → TABLE_CAPACITY if no free table, else OPPORTUNITY_GRACE
 * 3. No legal READY pod, but a PLAYING multi-pool participant would complete
 *    one if they were READY now
 *    → CONNECTOR_LOCKOUT_OTHER_POOL if that connector is seated in a different
 *      accepted pool than the waiting pool that would form
 *    → CONNECTOR_LOCKOUT_SAME_POOL if they are already playing in that pool
 * 4. STRUCTURAL_SCARCITY
 * 5. OTHER_UNKNOWN (defensive only; should not occur with valid settings)
 *
 * Ambiguity notes:
 * - Grace vs table: if the only legal pod is grace-delayed but no table is
 *   free, TABLE_CAPACITY wins. Grace is not why they cannot sit.
 * - Grace vs matcher: if they can sit in a non-grace legal pod (typically a
 *   4-pod), MATCHER_CHOICE/TABLE wins even if a 3-pod is also delayed.
 * - Connector lockout is retrospective opportunity-cost, not proof that an
 *   online matcher should have reserved the connector.
 * - SAME_POOL lockout is a peer currently playing the same bracket, not an
 *   allocation-of-flexibility issue.
 */

export const WAIT_CAUSE_KINDS = [
  'OPPORTUNITY_GRACE',
  'TABLE_CAPACITY',
  'MATCHER_CHOICE',
  'CONNECTOR_LOCKOUT_OTHER_POOL',
  'CONNECTOR_LOCKOUT_SAME_POOL',
  'STRUCTURAL_SCARCITY',
  'OTHER_UNKNOWN',
] as const;

export type WaitCauseKind = (typeof WAIT_CAUSE_KINDS)[number];

export type WaitCauseParticipant = {
  id: string;
  readyAt: number;
  poolIds: readonly string[];
  preferredPoolId: string;
};

export type WaitCausePlayingParticipant = {
  id: string;
  poolIds: readonly string[];
  preferredPoolId: string;
  assignedPoolId: string;
  gameStartedAt: number;
  gameEndedAt: number;
};

export type WaitCauseSettings = {
  now: number;
  minPodSize: number;
  preferredPodSize: number;
  graceSeconds: number;
  maxExistingWaitSeconds?: number;
  freeTableCount: number;
  ready: readonly WaitCauseParticipant[];
  playing: readonly WaitCausePlayingParticipant[];
};

export type WaitCauseConnector = {
  id: string;
  assignedPoolId: string;
  acceptedPoolIds: readonly string[];
  preferredPoolId: string;
  gameStartedAt: number;
  gameEndedAt: number;
  remainingGameSeconds: number;
  waitingPoolId: string;
};

export type WaitCauseClassification = {
  cause: WaitCauseKind;
  legalReadyPod: boolean;
  connector?: WaitCauseConnector;
  exclusiveWaitersInWaitingPool: number;
};

export type WaitCauseSeconds = {
  structuralScarcity: number;
  tableCapacity: number;
  matcherChoice: number;
  connectorLockoutOtherPool: number;
  connectorLockoutSamePool: number;
  opportunityGrace: number;
  unknown: number;
};

export const EMPTY_WAIT_CAUSE_SECONDS: WaitCauseSeconds = {
  structuralScarcity: 0,
  tableCapacity: 0,
  matcherChoice: 0,
  connectorLockoutOtherPool: 0,
  connectorLockoutSamePool: 0,
  opportunityGrace: 0,
  unknown: 0,
};

export function emptyWaitCauseSeconds(): WaitCauseSeconds {
  return { ...EMPTY_WAIT_CAUSE_SECONDS };
}

export function addWaitCauseSeconds(
  target: WaitCauseSeconds,
  cause: WaitCauseKind,
  seconds: number,
): void {
  if (seconds <= 0) return;
  switch (cause) {
    case 'STRUCTURAL_SCARCITY':
      target.structuralScarcity += seconds;
      break;
    case 'TABLE_CAPACITY':
      target.tableCapacity += seconds;
      break;
    case 'MATCHER_CHOICE':
      target.matcherChoice += seconds;
      break;
    case 'CONNECTOR_LOCKOUT_OTHER_POOL':
      target.connectorLockoutOtherPool += seconds;
      break;
    case 'CONNECTOR_LOCKOUT_SAME_POOL':
      target.connectorLockoutSamePool += seconds;
      break;
    case 'OPPORTUNITY_GRACE':
      target.opportunityGrace += seconds;
      break;
    case 'OTHER_UNKNOWN':
      target.unknown += seconds;
      break;
  }
}

export function totalWaitCauseSeconds(seconds: WaitCauseSeconds): number {
  return (
    seconds.structuralScarcity +
    seconds.tableCapacity +
    seconds.matcherChoice +
    seconds.connectorLockoutOtherPool +
    seconds.connectorLockoutSamePool +
    seconds.opportunityGrace +
    seconds.unknown
  );
}

export function waitCauseAccountingHolds(
  cycleDurationSeconds: number,
  seconds: WaitCauseSeconds,
  toleranceSeconds = 0,
): boolean {
  return (
    Math.abs(totalWaitCauseSeconds(seconds) - cycleDurationSeconds) <=
    toleranceSeconds
  );
}

export function poolIdsOf(participant: {
  poolIds?: readonly string[];
  decks?: readonly { poolId: string }[];
}): string[] {
  if (participant.poolIds) return [...participant.poolIds];
  return [...new Set((participant.decks ?? []).map((deck) => deck.poolId))];
}

export function compatibleReady(
  ready: readonly WaitCauseParticipant[],
  poolId: string,
): WaitCauseParticipant[] {
  return ready.filter((participant) => participant.poolIds.includes(poolId));
}

export function hasLegalReadyPod(
  participant: WaitCauseParticipant,
  ready: readonly WaitCauseParticipant[],
  minPodSize: number,
): boolean {
  return legalReadyPools(participant, ready, minPodSize).length > 0;
}

export function legalReadyPools(
  participant: WaitCauseParticipant,
  ready: readonly WaitCauseParticipant[],
  minPodSize: number,
): string[] {
  return participant.poolIds.filter(
    (poolId) => compatibleReady(ready, poolId).length >= minPodSize,
  );
}

export function isOpportunityGraceDelayedPool(
  poolId: string,
  settings: WaitCauseSettings,
): boolean {
  if (settings.graceSeconds <= 0) return false;
  if (settings.preferredPodSize <= settings.minPodSize) return false;
  const compatible = compatibleReady(settings.ready, poolId);
  if (compatible.length !== settings.minPodSize) return false;
  const readyAts = compatible.map((participant) => participant.readyAt);
  const oldestReadyAt = Math.min(...readyAts);
  const opportunityAt = Math.max(...readyAts);
  const existingWait = opportunityAt - oldestReadyAt;
  if (
    settings.maxExistingWaitSeconds !== undefined &&
    existingWait >= settings.maxExistingWaitSeconds
  ) {
    return false;
  }
  return settings.now < opportunityAt + settings.graceSeconds;
}

export function classifyWaitCause(
  participantId: string,
  settings: WaitCauseSettings,
): WaitCauseClassification {
  const participant = settings.ready.find((entry) => entry.id === participantId);
  if (!participant || !Number.isFinite(settings.minPodSize) || settings.minPodSize < 1) {
    return {
      cause: 'OTHER_UNKNOWN',
      legalReadyPod: false,
      exclusiveWaitersInWaitingPool: 0,
    };
  }

  const legalPools = legalReadyPools(
    participant,
    settings.ready,
    settings.minPodSize,
  );
  const nonGraceLegal = legalPools.filter(
    (poolId) => !isOpportunityGraceDelayedPool(poolId, settings),
  );
  const graceLegal = legalPools.filter((poolId) =>
    isOpportunityGraceDelayedPool(poolId, settings),
  );

  if (nonGraceLegal.length > 0) {
    return {
      cause: settings.freeTableCount > 0 ? 'MATCHER_CHOICE' : 'TABLE_CAPACITY',
      legalReadyPod: true,
      exclusiveWaitersInWaitingPool: exclusiveReadyCount(
        settings.ready,
        nonGraceLegal[0]!,
      ),
    };
  }
  if (graceLegal.length > 0) {
    return {
      cause: settings.freeTableCount > 0 ? 'OPPORTUNITY_GRACE' : 'TABLE_CAPACITY',
      legalReadyPod: true,
      exclusiveWaitersInWaitingPool: exclusiveReadyCount(
        settings.ready,
        graceLegal[0]!,
      ),
    };
  }

  const lockout = findConnectorLockout(participant, settings);
  if (lockout) {
    return {
      cause: lockout.samePool
        ? 'CONNECTOR_LOCKOUT_SAME_POOL'
        : 'CONNECTOR_LOCKOUT_OTHER_POOL',
      legalReadyPod: false,
      connector: lockout.connector,
      exclusiveWaitersInWaitingPool: exclusiveReadyCount(
        settings.ready,
        lockout.connector.waitingPoolId,
      ),
    };
  }

  return {
    cause: 'STRUCTURAL_SCARCITY',
    legalReadyPod: false,
    exclusiveWaitersInWaitingPool: exclusiveReadyCount(
      settings.ready,
      participant.preferredPoolId,
    ),
  };
}

function exclusiveReadyCount(
  ready: readonly WaitCauseParticipant[],
  poolId: string,
): number {
  return ready.filter(
    (participant) =>
      participant.poolIds.length === 1 && participant.poolIds[0] === poolId,
  ).length;
}

function findConnectorLockout(
  waiter: WaitCauseParticipant,
  settings: WaitCauseSettings,
): { samePool: boolean; connector: WaitCauseConnector } | undefined {
  const other: WaitCauseConnector[] = [];
  const same: WaitCauseConnector[] = [];
  for (const playing of settings.playing) {
    if (playing.poolIds.length < 2) continue;
    const hypothetical: WaitCauseParticipant = {
      id: playing.id,
      readyAt: settings.now,
      poolIds: playing.poolIds,
      preferredPoolId: playing.preferredPoolId,
    };
    const withConnector = [...settings.ready, hypothetical];
    const newlyLegal = waiter.poolIds.filter((poolId) => {
      const without = compatibleReady(settings.ready, poolId).length;
      const withCount = compatibleReady(withConnector, poolId).length;
      return without < settings.minPodSize && withCount >= settings.minPodSize;
    });
    if (newlyLegal.length === 0) continue;
    const waitingPoolId =
      newlyLegal.find((poolId) => poolId !== playing.assignedPoolId) ??
      newlyLegal[0]!;
    const connector: WaitCauseConnector = {
      id: playing.id,
      assignedPoolId: playing.assignedPoolId,
      acceptedPoolIds: playing.poolIds,
      preferredPoolId: playing.preferredPoolId,
      gameStartedAt: playing.gameStartedAt,
      gameEndedAt: playing.gameEndedAt,
      remainingGameSeconds: Math.max(0, playing.gameEndedAt - settings.now),
      waitingPoolId,
    };
    if (playing.assignedPoolId === waitingPoolId) same.push(connector);
    else other.push(connector);
  }
  const chosen = pickConnector(other) ?? pickConnector(same);
  if (!chosen) return undefined;
  return { samePool: other.length === 0, connector: chosen };
}

function pickConnector(
  connectors: readonly WaitCauseConnector[],
): WaitCauseConnector | undefined {
  return [...connectors].sort(
    (left, right) =>
      left.remainingGameSeconds - right.remainingGameSeconds ||
      left.id.localeCompare(right.id),
  )[0];
}

export type WaitCauseInterval = {
  startedAt: number;
  endedAt: number;
  cause: WaitCauseKind;
  connector?: WaitCauseConnector;
  exclusiveWaitersInWaitingPool: number;
  anotherConnectorBecameReadyBeforeReturn?: boolean;
};

export type ConnectorLockoutEvent = {
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  waitingPoolId: string;
  waitingParticipantId: string;
  exclusiveWaitersAffected: number;
  connectorId: string;
  connectorAssignedPoolId: string;
  connectorAcceptedPoolIds: readonly string[];
  connectorPreferredPoolId: string;
  gameStartedAt: number;
  gameEndedAt: number;
  remainingGameSecondsAtStart: number;
  anotherConnectorBecameReadyBeforeReturn: boolean;
};

export class WaitCauseAccumulator {
  private readonly byParticipant = new Map<
    string,
    {
      seconds: WaitCauseSeconds;
      intervals: WaitCauseInterval[];
      openLockout?: ConnectorLockoutEvent;
    }
  >();
  private lastAttributedAt = 0;
  readonly lockoutEvents: ConnectorLockoutEvent[] = [];

  constructor(private readonly recordIntervals: boolean) {}

  flush(settings: WaitCauseSettings): void {
    const dt = settings.now - this.lastAttributedAt;
    if (dt < 0) {
      throw new Error(
        `Wait-cause clock moved backwards from ${this.lastAttributedAt} to ${settings.now}.`,
      );
    }
    if (dt > 0) {
      const snapshot = { ...settings, now: this.lastAttributedAt };
      const readyIds = new Set(snapshot.ready.map((participant) => participant.id));
      for (const [participantId, state] of this.byParticipant) {
        if (!readyIds.has(participantId)) continue;
        const classified = classifyWaitCause(participantId, snapshot);
        addWaitCauseSeconds(state.seconds, classified.cause, dt);
        this.trackInterval(
          participantId,
          state,
          settings.now,
          dt,
          classified,
          snapshot,
        );
      }
    }
    this.lastAttributedAt = settings.now;
  }

  startCycle(participantId: string): void {
    this.byParticipant.set(participantId, {
      seconds: emptyWaitCauseSeconds(),
      intervals: [],
    });
  }

  endCycle(
    participantId: string,
    settings: WaitCauseSettings,
  ): { seconds: WaitCauseSeconds; intervals: readonly WaitCauseInterval[] } {
    this.flush(settings);
    const state = this.byParticipant.get(participantId);
    if (state?.openLockout) {
      this.closeLockout(state, settings.now);
    }
    this.byParticipant.delete(participantId);
    return {
      seconds: state?.seconds ?? emptyWaitCauseSeconds(),
      intervals: state?.intervals ?? [],
    };
  }

  closeRemaining(settings: WaitCauseSettings): void {
    this.flush(settings);
    for (const state of this.byParticipant.values()) {
      if (state.openLockout) this.closeLockout(state, settings.now);
    }
  }

  private trackInterval(
    participantId: string,
    state: {
      seconds: WaitCauseSeconds;
      intervals: WaitCauseInterval[];
      openLockout?: ConnectorLockoutEvent;
    },
    now: number,
    dt: number,
    classified: WaitCauseClassification,
    settings: WaitCauseSettings,
  ): void {
    const startedAt = now - dt;
    const last = state.intervals[state.intervals.length - 1];
    if (this.recordIntervals) {
      if (last && last.cause === classified.cause && last.endedAt === startedAt) {
        last.endedAt = now;
        if (classified.connector) last.connector = classified.connector;
      } else {
        state.intervals.push({
          startedAt,
          endedAt: now,
          cause: classified.cause,
          connector: classified.connector,
          exclusiveWaitersInWaitingPool: classified.exclusiveWaitersInWaitingPool,
        });
      }
    }
    if (
      classified.cause === 'CONNECTOR_LOCKOUT_OTHER_POOL' &&
      classified.connector
    ) {
      if (
        !state.openLockout ||
        state.openLockout.connectorId !== classified.connector.id ||
        state.openLockout.waitingPoolId !== classified.connector.waitingPoolId
      ) {
        if (state.openLockout) this.closeLockout(state, startedAt);
        state.openLockout = {
          startedAt,
          endedAt: now,
          durationSeconds: dt,
          waitingPoolId: classified.connector.waitingPoolId,
          waitingParticipantId: participantId,
          exclusiveWaitersAffected: classified.exclusiveWaitersInWaitingPool,
          connectorId: classified.connector.id,
          connectorAssignedPoolId: classified.connector.assignedPoolId,
          connectorAcceptedPoolIds: classified.connector.acceptedPoolIds,
          connectorPreferredPoolId: classified.connector.preferredPoolId,
          gameStartedAt: classified.connector.gameStartedAt,
          gameEndedAt: classified.connector.gameEndedAt,
          remainingGameSecondsAtStart: classified.connector.remainingGameSeconds,
          anotherConnectorBecameReadyBeforeReturn: false,
        };
      } else {
        state.openLockout.endedAt = now;
        state.openLockout.durationSeconds = now - state.openLockout.startedAt;
      }
      if (
        state.openLockout &&
        now < state.openLockout.gameEndedAt &&
        settings.ready.some(
          (participant) =>
            participant.id !== state.openLockout?.connectorId &&
            participant.poolIds.length > 1 &&
            participant.poolIds.includes(state.openLockout?.waitingPoolId ?? ''),
        )
      ) {
        state.openLockout.anotherConnectorBecameReadyBeforeReturn = true;
        const interval = state.intervals[state.intervals.length - 1];
        if (interval) interval.anotherConnectorBecameReadyBeforeReturn = true;
      }
    } else if (state.openLockout) {
      this.closeLockout(state, startedAt);
    }
  }

  private closeLockout(
    state: { openLockout?: ConnectorLockoutEvent },
    endedAt: number,
  ): void {
    const open = state.openLockout;
    if (!open) return;
    open.endedAt = endedAt;
    open.durationSeconds = Math.max(0, endedAt - open.startedAt);
    if (open.durationSeconds > 0) {
      this.lockoutEvents.push(open);
    }
    state.openLockout = undefined;
  }
}
