import {
  calculateLimitedStandings,
  defaultLimitedEventModeConfig,
  defaultLimitedRounds,
  deterministicDraftSeats,
  isLimitedMode,
  limitedModeConfig,
  pairLimitedRound,
  pauseLimitedTimer,
  resumeLimitedTimer,
  startLimitedTimer,
  validateLimitedCohortSize,
  type DraftPod,
  type LimitedEventModeConfig,
  type LimitedMatch,
  type LimitedMatchOutcome,
  type LimitedMode,
  type LimitedRound,
  type LimitedSessionParticipant,
  type LimitedSessionStatus,
  type LimitedStanding,
  type LimitedTimer,
} from '@podyguard/shared';
import { defaultSeatNames } from '../match-config';
import { readStored, removeStored, writeStored } from '../device-storage';
import { scoreForOutcome } from './limited-view';

const CONFIG_KEY = 'podyguard.limited.local.config';
const SESSION_KEY = 'podyguard.limited.local.session';

export type LocalLimitedConfig = {
  mode: LimitedMode;
  playerCount: number;
  matchStructure: LimitedEventModeConfig['matchStructure'];
  totalRounds: number | 'AUTO';
  draftMinutes?: number;
  deckbuildingMinutes: number;
  roundMinutes: number;
  names: string[];
};

export type LocalLimitedSession = {
  id: string;
  config: LocalLimitedConfig;
  status: LimitedSessionStatus;
  participants: LimitedSessionParticipant[];
  draftPod?: DraftPod;
  rounds: LimitedRound[];
  currentRound?: number;
  totalRounds: number;
  timer?: LimitedTimer;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export function cohortSizeForMode(mode: LimitedMode): number {
  const config = limitedModeConfig(mode);
  return config.preferredCohortSize ?? config.minCohortSize;
}

export function defaultLocalLimitedConfig(
  mode: LimitedMode = 'BOOSTER_DRAFT',
): LocalLimitedConfig {
  const defaults = defaultLimitedEventModeConfig(mode);
  const playerCount = cohortSizeForMode(mode);
  return {
    mode,
    playerCount,
    matchStructure: defaults.matchStructure,
    totalRounds: defaults.totalRounds,
    draftMinutes: defaults.draftMinutes,
    deckbuildingMinutes: defaults.deckbuildingMinutes,
    roundMinutes: defaults.roundMinutes,
    names: defaultSeatNames(Math.max(playerCount, 8)),
  };
}

export function loadLocalLimitedConfig(): LocalLimitedConfig {
  const defaults = defaultLocalLimitedConfig();
  const raw = readStored(CONFIG_KEY);
  if (!raw) {
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LocalLimitedConfig>;
    const mode = isLimitedMode(parsed.mode) ? parsed.mode : defaults.mode;
    const playerCount = cohortSizeForMode(mode);
    const base = defaultLocalLimitedConfig(mode);
    return {
      ...base,
      ...parsed,
      mode,
      playerCount,
      names: padNames(parsed.names ?? base.names, playerCount),
    };
  } catch {
    return defaults;
  }
}

export function saveLocalLimitedConfig(config: LocalLimitedConfig): void {
  writeStored(CONFIG_KEY, JSON.stringify(config));
}

export function loadLocalLimitedSession(): LocalLimitedSession | null {
  const raw = readStored(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as LocalLimitedSession;
  } catch {
    return null;
  }
}

export function saveLocalLimitedSession(session: LocalLimitedSession): void {
  writeStored(SESSION_KEY, JSON.stringify(session));
}

export function clearLocalLimitedSession(): void {
  removeStored(SESSION_KEY);
}

export function localLimitedSessionActive(
  session: LocalLimitedSession | null,
): boolean {
  return Boolean(
    session &&
      session.status !== 'COMPLETED' &&
      session.status !== 'CANCELLED',
  );
}

function padNames(names: string[], count: number): string[] {
  const next = [...names];
  const defaults = defaultSeatNames(Math.max(count, 8));
  while (next.length < count) {
    next.push(defaults[next.length] ?? `Player ${next.length + 1}`);
  }
  return next.slice(0, Math.max(count, names.length));
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

export function createLocalLimitedSession(
  config: LocalLimitedConfig,
): LocalLimitedSession {
  validateLimitedCohortSize(config.mode, config.playerCount, {
    allowUndersizedLaunch: true,
    preferredCohortSize: config.playerCount,
    minCohortSize: limitedModeConfig(config.mode).minCohortSize,
    maxCohortSize: limitedModeConfig(config.mode).maxCohortSize,
  });
  const createdAt = nowIso();
  const names = padNames(config.names, config.playerCount);
  const participants: LimitedSessionParticipant[] = names
    .slice(0, config.playerCount)
    .map((displayName, index) => ({
      participantId: `local-${index + 1}`,
      displayName: displayName.trim() || `Player ${index + 1}`,
      status: 'ASSIGNED',
      joinedAt: createdAt,
      assignedAt: createdAt,
    }));
  const totalRounds =
    config.totalRounds === 'AUTO'
      ? defaultLimitedRounds(config.playerCount)
      : Math.max(1, config.totalRounds);
  const session: LocalLimitedSession = {
    id: newId('limited'),
    config: { ...config, names },
    status: 'FORMING',
    participants,
    rounds: [],
    totalRounds,
    createdAt,
  };
  saveLocalLimitedConfig(config);
  saveLocalLimitedSession(session);
  return session;
}

export function renameLocalParticipant(
  session: LocalLimitedSession,
  participantId: string,
  displayName: string,
): LocalLimitedSession {
  const participants = session.participants.map((participant) =>
    participant.participantId === participantId
      ? {
          ...participant,
          displayName: displayName.trim() || participant.displayName,
        }
      : participant,
  );
  const names = participants.map((participant) => participant.displayName);
  return persist({
    ...session,
    participants,
    config: { ...session.config, names },
  });
}

export function launchLocalLimitedSession(
  session: LocalLimitedSession,
): LocalLimitedSession {
  if (session.status !== 'FORMING' && session.status !== 'SEATING') {
    throw new Error('Only a forming local Limited pod can be launched.');
  }
  const modeConfig = limitedModeConfig(session.config.mode);
  const seats = deterministicDraftSeats(
    session.participants.map((participant) => participant.participantId),
  );
  const startedAt = nowIso();
  const draftPod: DraftPod = {
    id: `${session.id}:pod`,
    sessionId: session.id,
    tableIds: [],
    seats: [...seats],
  };
  const participants = session.participants.map((participant) => {
    const seat = seats.find(
      (row) => row.participantId === participant.participantId,
    )?.seat;
    return {
      ...participant,
      draftSeat: seat,
      status: modeConfig.hasDraftPhase ? 'DRAFTING' : 'DECKBUILDING',
    } as LimitedSessionParticipant;
  });
  if (modeConfig.hasDraftPhase) {
    return persist({
      ...session,
      status: 'DRAFTING',
      startedAt,
      draftPod,
      participants,
      timer: startLimitedTimer(
        'DRAFTING',
        Math.max(1, (session.config.draftMinutes ?? 50) * 60),
        startedAt,
      ),
    });
  }
  return persist({
    ...session,
    status: 'DECKBUILDING',
    startedAt,
    draftPod,
    participants,
    timer: startLimitedTimer(
      'DECKBUILDING',
      Math.max(1, session.config.deckbuildingMinutes * 60),
      startedAt,
    ),
  });
}

export function finishLocalDraft(
  session: LocalLimitedSession,
): LocalLimitedSession {
  if (session.status !== 'DRAFTING') {
    throw new Error('Draft is not active.');
  }
  const startedAt = nowIso();
  return persist({
    ...session,
    status: 'DECKBUILDING',
    participants: session.participants.map((participant) =>
      participant.status === 'DROPPED'
        ? participant
        : { ...participant, status: 'DECKBUILDING' },
    ),
    timer: startLimitedTimer(
      'DECKBUILDING',
      Math.max(1, session.config.deckbuildingMinutes * 60),
      startedAt,
    ),
  });
}

export function startLocalLimitedRound(
  session: LocalLimitedSession,
): LocalLimitedSession {
  if (
    session.status !== 'DECKBUILDING' &&
    session.status !== 'BETWEEN_ROUNDS'
  ) {
    throw new Error('Rounds start after deckbuilding or between rounds.');
  }
  const nextRound = (session.currentRound ?? 0) + 1;
  if (nextRound > session.totalRounds) {
    return completeLocalLimitedSession(session);
  }
  const bestOf = session.config.matchStructure === 'BO1' ? 1 : 3;
  const previousMatches = session.rounds.flatMap((round) => round.matches);
  const round = pairLimitedRound({
    sessionId: session.id,
    mode: session.config.mode,
    roundNumber: nextRound,
    participants: session.participants.map((participant) => ({
      participantId: participant.participantId,
      displayName: participant.displayName,
      dropped: participant.status === 'DROPPED',
    })),
    previousMatches,
    bestOf,
  });
  const startedAt = nowIso();
  const activeRound: LimitedRound = {
    ...round,
    status: 'ACTIVE',
    startedAt,
    matches: round.matches.map((match) =>
      match.outcome === 'BYE'
        ? match
        : { ...match, status: 'PLAYING' as const },
    ),
  };
  return persist({
    ...session,
    status: 'ROUND_ACTIVE',
    currentRound: nextRound,
    rounds: [...session.rounds, activeRound],
    participants: session.participants.map((participant) => {
      if (participant.status === 'DROPPED') {
        return participant;
      }
      const inMatch = activeRound.matches.some(
        (match) =>
          match.playerAId === participant.participantId ||
          match.playerBId === participant.participantId,
      );
      return {
        ...participant,
        status: inMatch ? 'PLAYING' : 'WAITING_FOR_ROUND',
      };
    }),
    timer: startLimitedTimer(
      'ROUND',
      Math.max(1, session.config.roundMinutes * 60),
      startedAt,
    ),
  });
}

export function reportLocalLimitedResult(
  session: LocalLimitedSession,
  matchId: string,
  outcome: Exclude<LimitedMatchOutcome, 'BYE'>,
): LocalLimitedSession {
  if (session.status !== 'ROUND_ACTIVE' || session.currentRound == null) {
    throw new Error('No active Limited round.');
  }
  const roundIndex = session.rounds.findIndex(
    (round) => round.number === session.currentRound,
  );
  if (roundIndex < 0) {
    throw new Error('Active round missing.');
  }
  const round = session.rounds[roundIndex]!;
  const match = round.matches.find((row) => row.id === matchId);
  if (!match || !match.playerBId) {
    throw new Error('Match not found.');
  }
  const score = scoreForOutcome(outcome, match.bestOf);
  const reportedAt = nowIso();
  const matches = round.matches.map((row) =>
    row.id === matchId
      ? {
          ...row,
          status: 'COMPLETED' as const,
          outcome,
          reportedAt,
          playerAGameWins: score.playerAGameWins,
          playerBGameWins: score.playerBGameWins,
        }
      : row,
  );
  const updatedRound: LimitedRound = { ...round, matches };
  const rounds = session.rounds.map((row, index) =>
    index === roundIndex ? updatedRound : row,
  );
  const allDone = matches.every((row) => row.status === 'COMPLETED');
  if (!allDone) {
    return persist({ ...session, rounds });
  }
  const completedRound: LimitedRound = {
    ...updatedRound,
    status: 'COMPLETED',
    completedAt: reportedAt,
  };
  const nextRounds = rounds.map((row, index) =>
    index === roundIndex ? completedRound : row,
  );
  if ((session.currentRound ?? 0) >= session.totalRounds) {
    return completeLocalLimitedSession({
      ...session,
      rounds: nextRounds,
    });
  }
  return persist({
    ...session,
    status: 'BETWEEN_ROUNDS',
    rounds: nextRounds,
    participants: session.participants.map((participant) =>
      participant.status === 'DROPPED'
        ? participant
        : { ...participant, status: 'WAITING_FOR_ROUND' },
    ),
    timer: undefined,
  });
}

export function completeLocalLimitedSession(
  session: LocalLimitedSession,
): LocalLimitedSession {
  const completedAt = nowIso();
  return persist({
    ...session,
    status: 'COMPLETED',
    completedAt,
    timer: undefined,
    participants: session.participants.map((participant) =>
      participant.status === 'DROPPED'
        ? participant
        : { ...participant, status: 'COMPLETED' },
    ),
  });
}

export function cancelLocalLimitedSession(
  session: LocalLimitedSession,
): LocalLimitedSession {
  const next = persist({
    ...session,
    status: 'CANCELLED',
    completedAt: nowIso(),
    timer: undefined,
  });
  return next;
}

export function pauseLocalLimitedTimer(
  session: LocalLimitedSession,
): LocalLimitedSession {
  if (!session.timer) {
    return session;
  }
  return persist({
    ...session,
    timer: pauseLimitedTimer(session.timer, nowIso()),
  });
}

export function resumeLocalLimitedTimer(
  session: LocalLimitedSession,
): LocalLimitedSession {
  if (!session.timer) {
    return session;
  }
  return persist({
    ...session,
    timer: resumeLimitedTimer(session.timer, nowIso()),
  });
}

export function localLimitedStandings(
  session: LocalLimitedSession,
): LimitedStanding[] {
  return calculateLimitedStandings(
    session.participants.map((participant) => ({
      participantId: participant.participantId,
      displayName: participant.displayName,
      dropped: participant.status === 'DROPPED',
    })),
    session.rounds.flatMap((round) => round.matches),
  );
}

export function allMatches(session: LocalLimitedSession): LimitedMatch[] {
  return session.rounds.flatMap((round) => round.matches);
}

function persist(session: LocalLimitedSession): LocalLimitedSession {
  saveLocalLimitedSession(session);
  return session;
}
