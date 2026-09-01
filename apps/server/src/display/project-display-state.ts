import {
  DISPLAY_ASSIGNMENT_HIGHLIGHT_MS,
  LIMITED_MODE_CONFIGS,
  poolShortLabel,
  type DisplayConfig,
  type EventSnapshot,
  type PublicDisplayAnnouncement,
  type PublicDisplayAssignment,
  type PublicDisplayEventState,
  type PublicDisplayLimitedSession,
  type PublicDisplayQueue,
  type PublicDisplayTable,
  type PublicDisplayTableActivity,
  type PublicLimitedSession,
} from '@podyguard/shared';

export type DisplayActivityPod = {
  tableId: string;
  tableLabel: string;
  status: 'formed' | 'playing';
  playerNames: string[];
  poolId?: string;
  createdAt: Date;
};

export function projectPublicDisplayState(input: {
  snapshot: EventSnapshot;
  config: DisplayConfig;
  pods: DisplayActivityPod[];
  announcement: PublicDisplayAnnouncement | null;
  now?: Date;
}): PublicDisplayEventState {
  const now = input.now ?? new Date();
  const { snapshot, config } = input;
  const limitedByTable = limitedTableOwners(snapshot.limitedSessions ?? []);

  const tables: PublicDisplayTable[] = snapshot.tables
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((table) => {
      const pod = input.pods.find((row) => row.tableId === table.id);
      const limited = limitedByTable.get(table.id);
      const names = config.showPlayerNames
        ? (pod?.playerNames ?? table.seatedNames)
        : [];
      const playerCount = pod?.playerNames.length ?? table.seatedNames.length;

      let activity: PublicDisplayTableActivity = 'FREE';
      let activityLabel = 'Free';
      let activityStartedAt: string | undefined;
      let limitedSessionLabel: string | undefined;
      let limitedRound: number | undefined;
      let limitedResultsReported: number | undefined;
      let limitedResultsTotal: number | undefined;

      if (table.status === 'disabled') {
        activity = 'DISABLED';
        activityLabel = 'Disabled';
      } else if (limited) {
        limitedSessionLabel = limited.label;
        limitedRound = limited.currentRound;
        const progress = limitedResultProgress(limited);
        limitedResultsReported = progress.reported;
        limitedResultsTotal = progress.total;
        if (
          limited.status === 'DRAFTING' ||
          limited.status === 'SEATING' ||
          limited.status === 'FORMING'
        ) {
          activity = 'LIMITED_DRAFT';
          activityLabel = `${limited.label} · Drafting`;
        } else if (limited.status === 'DECKBUILDING') {
          activity = 'LIMITED_DECKBUILDING';
          activityLabel = `${limited.label} · Deckbuilding`;
        } else {
          activity = 'LIMITED_ROUND';
          activityLabel = limited.currentRound
            ? `${limited.label} · Round ${limited.currentRound}`
            : limited.label;
        }
        activityStartedAt = limited.startedAt ?? limited.createdAt;
      } else if (pod) {
        activity = pod.status === 'playing' ? 'PLAYING' : 'MATCH';
        const pool = pod.poolId ? poolShortLabel(pod.poolId) : null;
        const modeLabel = formatModeLabel(snapshot.event.gameMode);
        activityLabel = pool ? `${modeLabel} · ${pool}` : modeLabel;
        activityStartedAt = pod.createdAt.toISOString();
      } else if (table.status === 'occupied') {
        activity = 'RESERVED';
        activityLabel = 'Reserved';
      }

      return {
        id: table.id,
        label: table.label,
        sortOrder: table.sortOrder,
        status: table.status,
        activity,
        activityLabel,
        playerNames: names,
        playerCount,
        ...(activityStartedAt ? { activityStartedAt } : {}),
        ...(limitedSessionLabel ? { limitedSessionLabel } : {}),
        ...(limitedRound !== undefined ? { limitedRound } : {}),
        ...(limitedResultsReported !== undefined
          ? { limitedResultsReported }
          : {}),
        ...(limitedResultsTotal !== undefined ? { limitedResultsTotal } : {}),
      };
    });

  const queues = config.showQueues
    ? buildQueues(snapshot)
    : ([] as PublicDisplayQueue[]);

  const recentAssignments = buildRecentAssignments({
    pods: input.pods,
    limitedSessions: snapshot.limitedSessions ?? [],
    showPlayerNames: config.showPlayerNames,
    now,
  });

  const limitedSessions = (snapshot.limitedSessions ?? [])
    .filter((session) => session.status !== 'CANCELLED')
    .map((session) => toPublicDisplayLimitedSession(session, config));

  return {
    serverNow: now.toISOString(),
    event: {
      id: snapshot.event.id,
      name: snapshot.event.name,
      joinCode: snapshot.event.joinCode,
      publicStatus: snapshot.event.status,
      gameMode: snapshot.event.gameMode,
    },
    config,
    tables,
    queues,
    recentAssignments,
    limitedSessions,
    announcement: input.announcement,
  };
}

function formatModeLabel(mode: EventSnapshot['event']['gameMode']): string {
  switch (mode) {
    case 'duel':
      return 'Duel';
    case 'duel-commander':
      return 'Duel Commander';
    case 'two-headed-giant':
      return 'Two-Headed Giant';
    case 'archenemy-commander':
      return 'Archenemy';
    default:
      return mode
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function buildQueues(snapshot: EventSnapshot): PublicDisplayQueue[] {
  const queues: PublicDisplayQueue[] = [];
  const ready = snapshot.participants.filter((row) => row.status === 'ready');
  if (ready.length > 0) {
    const byPool = new Map<string, typeof ready>();
    for (const row of ready) {
      const preferred =
        row.decks.find((deck) => deck.preference === 'preferred')?.poolId ??
        row.decks[0]?.poolId ??
        'open';
      const list = byPool.get(preferred) ?? [];
      list.push(row);
      byPool.set(preferred, list);
    }
    const target = snapshot.event.preferredPodSize;
    for (const [poolId, rows] of byPool) {
      const oldest = rows
        .map((row) => row.readyAt)
        .filter(Boolean)
        .sort()[0];
      const need = Math.max(0, target - rows.length);
      queues.push({
        id: `casual:${poolId}`,
        label:
          poolId === 'open'
            ? formatModeLabel(snapshot.event.gameMode)
            : `${formatModeLabel(snapshot.event.gameMode)} · ${poolShortLabel(poolId)}`,
        readyCount: rows.length,
        ...(oldest ? { oldestReadyAt: oldest } : {}),
        hint:
          need > 0
            ? `Need ${need} more`
            : rows.length >= target
              ? 'Match ready'
              : undefined,
        kind: 'casual',
        targetCount: target,
      });
    }
  }

  for (const config of snapshot.event.limitedModeConfigs ?? []) {
    if (!config.enabled) continue;
    const summary = snapshot.limitedQueues?.find(
      (row) => row.mode === config.mode,
    );
    const waiting = summary?.waitingCount ?? 0;
    const target =
      config.preferredCohortSize ??
      config.minCohortSize ??
      LIMITED_MODE_CONFIGS[config.mode].minCohortSize;
    const need = Math.max(0, target - waiting);
    queues.push({
      id: `limited:${config.mode}`,
      label: limitedModeLabel(config.mode),
      readyCount: waiting,
      ...(summary?.oldestReadyAt
        ? { oldestReadyAt: summary.oldestReadyAt }
        : {}),
      hint:
        need > 0
          ? `Need ${need} more`
          : waiting >= target
            ? 'Ready to launch'
            : undefined,
      kind: 'limited',
      limitedMode: config.mode,
      targetCount: target,
    });
  }

  return queues;
}

function buildRecentAssignments(input: {
  pods: DisplayActivityPod[];
  limitedSessions: PublicLimitedSession[];
  showPlayerNames: boolean;
  now: Date;
}): PublicDisplayAssignment[] {
  const cutoff = input.now.getTime() - DISPLAY_ASSIGNMENT_HIGHLIGHT_MS;
  const assignments: PublicDisplayAssignment[] = [];

  for (const pod of input.pods) {
    if (pod.createdAt.getTime() < cutoff) continue;
    assignments.push({
      id: `pod:${pod.tableId}:${pod.createdAt.toISOString()}`,
      kind: 'match',
      title: 'New match',
      subtitle: pod.poolId ? poolShortLabel(pod.poolId) : undefined,
      tableLabel: pod.tableLabel,
      playerNames: input.showPlayerNames ? pod.playerNames : [],
      assignedAt: pod.createdAt.toISOString(),
    });
  }

  for (const session of input.limitedSessions) {
    if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
      continue;
    }
    const assignedAt = Date.parse(session.startedAt ?? session.createdAt);
    if (Number.isNaN(assignedAt) || assignedAt < cutoff) continue;
    if (
      session.status === 'FORMING' ||
      session.status === 'SEATING' ||
      session.status === 'DRAFTING'
    ) {
      assignments.push({
        id: `limited:${session.id}:${session.createdAt}`,
        kind: 'limited',
        title: `${session.label} ready`,
        subtitle: 'Please go to the draft area',
        playerNames: [],
        assignedAt: session.startedAt ?? session.createdAt,
      });
    }
  }

  return assignments.sort(
    (a, b) => Date.parse(b.assignedAt) - Date.parse(a.assignedAt),
  );
}

function limitedTableOwners(
  sessions: PublicLimitedSession[],
): Map<string, PublicLimitedSession> {
  const map = new Map<string, PublicLimitedSession>();
  for (const session of sessions) {
    if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
      continue;
    }
    for (const tableId of session.draftTableIds ?? []) {
      map.set(tableId, session);
    }
    for (const round of session.rounds) {
      for (const match of round.matches) {
        // Matches may only expose table labels; draftTableIds cover reserved tables.
        void match;
      }
    }
  }
  return map;
}

function limitedResultProgress(session: PublicLimitedSession): {
  reported: number;
  total: number;
} {
  const round = session.rounds.find(
    (row) => row.number === session.currentRound,
  );
  if (!round) {
    return { reported: 0, total: 0 };
  }
  const total = round.matches.filter((match) => match.outcome !== 'BYE').length;
  const reported = round.matches.filter(
    (match) => match.outcome && match.outcome !== 'BYE',
  ).length;
  return { reported, total };
}

function toPublicDisplayLimitedSession(
  session: PublicLimitedSession,
  config: DisplayConfig,
): PublicDisplayLimitedSession {
  const round = session.rounds.find(
    (row) => row.number === session.currentRound,
  );
  const progress = limitedResultProgress(session);
  const nameById = new Map(
    session.participants.map((row) => [row.participantId, row.displayName]),
  );
  return {
    id: session.id,
    label: session.label,
    mode: session.mode,
    status: session.status,
    ...(session.currentRound !== undefined && session.currentRound !== null
      ? { currentRound: session.currentRound }
      : {}),
    totalRounds: session.totalRounds,
    playerCount: session.participants.filter((row) => row.status !== 'DROPPED')
      .length,
    ...(config.showTimers && session.timer ? { timer: session.timer } : {}),
    matches: (round?.matches ?? []).map((match) => ({
      id: match.id,
      position: match.position,
      ...(match.tableLabel ? { tableLabel: match.tableLabel } : {}),
      playerAName: config.showPlayerNames
        ? (nameById.get(match.playerAId) ?? 'Player')
        : 'Player',
      ...(match.playerBId
        ? {
            playerBName: config.showPlayerNames
              ? (nameById.get(match.playerBId) ?? 'Player')
              : 'Player',
          }
        : {}),
      status: match.status,
      ...(match.outcome ? { outcome: match.outcome } : {}),
    })),
    resultsReported: progress.reported,
    resultsTotal: progress.total,
  };
}

function limitedModeLabel(mode: keyof typeof LIMITED_MODE_CONFIGS): string {
  switch (mode) {
    case 'BOOSTER_DRAFT':
      return 'Booster Draft';
    case 'PICK_TWO_DRAFT':
      return 'Pick-Two Draft';
    case 'SEALED':
      return 'Sealed';
    default:
      return mode;
  }
}

export function configFromSession(row: {
  mode: DisplayConfig['mode'];
  showPlayerNames: boolean;
  showQueues: boolean;
  showTimers: boolean;
}): DisplayConfig {
  return {
    mode: row.mode,
    showPlayerNames: row.showPlayerNames,
    showQueues: row.showQueues,
    showTimers: row.showTimers,
  };
}
