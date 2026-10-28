import {
  normalizeJoinCode,
  type DisplayMode,
  type DuelMatchOutcome,
  type EventMetrics,
  type EventOperationMode,
  type GameMode,
  type EventSnapshot,
  type HostDisplaySession,
  type LimitedEventModeConfig,
  type LimitedMatchOutcome,
  type LimitedMode,
  type LimitedSessionStatus,
  type LimitedTimerPhase,
  type PodRating,
  type PublicDisplayAnnouncement,
  type PublicDisplayEventState,
  type PublicEvent,
  type PublicChallengeCompletion,
  type PublicParticipant,
  type PublicPod,
  type PublicTable,
  type TreacheryRoleAssignment,
  type TournamentFormat,
  type TournamentOptions,
  type SeriesLength,
  type DerivedStats,
  type GameRecord,
  type GameResultType,
  type GuestIdentityVerification,
  type GuestProfile,
  type JoinGuestSuggestion,
  type JoinGuestSuggestionsResponse,
  type JoinSavedDeckSuggestion,
  type Playgroup,
  type PlaygroupOverview,
  type SavedDeckProfile,
  type UserAccount,
} from '@podyguard/shared';
import { resolveApiUrl } from './api-base';
import { readStored, removeStored, writeStored } from './device-storage';
import i18n from './i18n';
import type {
  CommanderArtwork,
  CommanderCandidate,
  CommanderSelection,
} from './scryfall';
import type { FeedbackPayload } from './feedback/types';

type DeckDraft = {
  name?: string;
  poolId: string;
  preference?: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(resolveApiUrl(path), {
      ...init,
      headers: {
        // Fastify rejects an empty body when the JSON content type is declared.
        ...(init?.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'API_UNREACHABLE',
      import.meta.env.PROD
        ? i18n.t('common.errors.apiWaking')
        : i18n.t('common.errors.apiUnreachable'),
    );
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
    message?: string;
  };
  if (!response.ok) {
    // Fastify's own 500s use { message }, our handled errors use { error }.
    throw new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ??
        body.message ??
        `Request failed (HTTP ${String(response.status)})`,
    );
  }
  return body as T;
}

export async function checkHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(resolveApiUrl('/health'), {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      database?: string;
    };
    return body.ok === true && body.database === 'up';
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  await request<{ ok: true }>('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createEvent(
  name: string,
  hostPin: string,
  tableCount: number,
  options?: {
    gameMode?: GameMode;
    rulesFormat?: 'normal' | 'commander';
    allowThreePods?: boolean;
    allowFivePods?: boolean;
    preferredPodSize?: number;
    lifetimeHours?: number;
    /** ROLLING (default) or ROUNDS — synchronized night. */
    operationMode?: EventOperationMode;
    tournamentFormat?: TournamentFormat;
    tournamentOptions?: TournamentOptions;
    limitedModeConfigs?: LimitedEventModeConfig[];
    playgroupId?: string | null;
    showReturningPlayerSuggestions?: boolean;
    accountToken?: string;
  },
) {
  const { accountToken, ...rest } = options ?? {};
  const token = accountToken ?? loadAccountToken();
  return request<{ event: PublicEvent; hostToken: string }>('/events', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ name, hostPin, tableCount, ...rest }),
  });
}

export function getEvent(joinCode: string) {
  return request<PublicEvent>(`/events/${joinCode}`);
}

export function getMyTreacheryRole(joinCode: string, token: string) {
  return request<{ assignment: TreacheryRoleAssignment }>(
    `/events/${joinCode}/me/treachery-role`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export function unveilMyTreacheryIdentity(joinCode: string, token: string) {
  return request<{ assignment: TreacheryRoleAssignment }>(
    `/events/${joinCode}/me/treachery-identity/unveil`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function listParticipants(joinCode: string) {
  return request<{ participants: PublicParticipant[] }>(
    `/events/${joinCode}/participants`,
  );
}

export function getJoinSuggestions(joinCode: string, query?: string) {
  const params = new URLSearchParams();
  if (query && query.trim().length > 0) {
    params.set('q', query.trim());
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<JoinGuestSuggestionsResponse>(
    `/events/${joinCode}/join-suggestions${suffix}`,
  );
}

export function getJoinGuestDecks(joinCode: string, guestProfileId: string) {
  return request<{
    guest: JoinGuestSuggestion;
    decks: JoinSavedDeckSuggestion[];
  }>(`/events/${joinCode}/join-suggestions/${guestProfileId}/decks`);
}

export function joinEvent(
  joinCode: string,
  displayName: string,
  decks?: DeckDraft[],
  options?: {
    guestProfileId?: string;
    savedDeckProfileId?: string;
    rememberMe?: boolean;
    accountToken?: string;
  },
) {
  const { accountToken, ...rest } = options ?? {};
  return request<{
    event: PublicEvent;
    participant: PublicParticipant;
    token: string;
  }>(`/events/${joinCode}/join`, {
    method: 'POST',
    headers: accountToken ? { Authorization: `Bearer ${accountToken}` } : {},
    body: JSON.stringify({ displayName, decks, ...rest }),
  });
}

export function setDecks(
  joinCode: string,
  token: string,
  decks: DeckDraft[],
) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/decks`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decks }),
    },
  );
}

export function searchCommanders(
  query: string,
  partnerFor?: string,
  profile: 'commander' | 'duel-commander' | 'brawl' = 'commander',
) {
  const params = new URLSearchParams({ q: query, profile });
  if (partnerFor) {
    params.set('pairedWith', partnerFor);
  }
  return request<{ cards: CommanderCandidate[] }>(
    `/scryfall/commanders?${params.toString()}`,
  ).then(({ cards }) => ({ commanders: cards }));
}

export function listCommanderArtwork(oracleId: string, name: string) {
  const params = new URLSearchParams({ oracleId, name });
  return request<{ artwork: CommanderArtwork[] }>(
    `/scryfall/artwork?${params.toString()}`,
  );
}

export function unlockHost(joinCode: string, hostPin: string) {
  return request<{ event: PublicEvent; hostToken: string }>(
    `/events/${joinCode}/host`,
    {
      method: 'POST',
      body: JSON.stringify({ hostPin }),
    },
  );
}

export function verifyHostToken(joinCode: string, token: string) {
  return request<{ event: PublicEvent }>(`/events/${joinCode}/host`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMe(joinCode: string, token: string) {
  return request<{ event: PublicEvent; participant: PublicParticipant }>(
    `/events/${joinCode}/me`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export function setReady(joinCode: string, token: string, ready: boolean) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/ready`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ready }),
    },
  );
}

export function setPaused(joinCode: string, token: string, paused: boolean) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/pause`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paused }),
    },
  );
}

export function leaveEvent(joinCode: string, token: string) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/leave`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

type LimitedResultInput = {
  outcome: Exclude<LimitedMatchOutcome, 'BYE'>;
  playerAGameWins: number;
  playerBGameWins: number;
};

export function joinLimitedQueue(
  joinCode: string,
  token: string,
  mode: LimitedMode,
) {
  return request<{ snapshot: EventSnapshot }>(
    `/events/${joinCode}/limited/queue`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode }),
    },
  );
}

export function leaveLimitedQueue(joinCode: string, token: string) {
  return request<{ snapshot: EventSnapshot }>(
    `/events/${joinCode}/limited/queue`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function assignLimitedTables(
  joinCode: string,
  token: string,
  input: { mode: LimitedMode; draftTableIds?: string[] },
) {
  return request<{
    session: import('@podyguard/shared').PublicLimitedSession;
    snapshot: import('@podyguard/shared').EventSnapshot;
  }>(
    `/events/${joinCode}/limited/assign`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

export function setLimitedSeatLayout(
  joinCode: string,
  token: string,
  sessionId: string,
  layout: 'square' | 'long',
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/layout', {
    method: 'POST',
    body: JSON.stringify({ layout }),
  });
}

export function claimLimitedSeat(
  joinCode: string,
  token: string,
  sessionId: string,
  seat: number,
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/seat', {
    method: 'POST',
    body: JSON.stringify({ seat }),
  });
}

export function confirmLimitedSeated(
  joinCode: string,
  token: string,
  sessionId: string,
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/seated', {
    method: 'POST',
  });
}

export function confirmLimitedPlay(
  joinCode: string,
  token: string,
  sessionId: string,
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/play', {
    method: 'POST',
  });
}

export function acknowledgeLimitedPhase(
  joinCode: string,
  token: string,
  sessionId: string,
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/ack', {
    method: 'POST',
  });
}

export function createLimitedSession(
  joinCode: string,
  token: string,
  input: {
    mode: LimitedMode;
    participantCount?: number;
    allowUndersizedLaunch?: boolean;
    label?: string;
    draftTableIds?: string[];
  },
) {
  return request<{ session: import('@podyguard/shared').PublicLimitedSession }>(
    `/events/${joinCode}/limited/sessions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

function limitedSessionRequest(
  joinCode: string,
  token: string,
  sessionId: string,
  suffix: string,
  init: RequestInit,
) {
  return request<{ session: import('@podyguard/shared').PublicLimitedSession }>(
    `/events/${joinCode}/limited/sessions/${sessionId}${suffix}`,
    {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    },
  );
}

export function launchLimitedSession(joinCode: string, token: string, sessionId: string) {
  return limitedSessionRequest(joinCode, token, sessionId, '/launch', { method: 'POST' });
}

export function replaceLimitedRoster(
  joinCode: string,
  token: string,
  sessionId: string,
  participantIds: string[],
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/roster', {
    method: 'PUT',
    body: JSON.stringify({ participantIds }),
  });
}

export function replaceLimitedDraftTables(
  joinCode: string,
  token: string,
  sessionId: string,
  tableIds: string[],
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/tables', {
    method: 'PUT',
    body: JSON.stringify({ tableIds }),
  });
}

export function advanceLimitedPhase(
  joinCode: string,
  token: string,
  sessionId: string,
  status: LimitedSessionStatus,
  durationSeconds?: number,
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/phase', {
    method: 'POST',
    body: JSON.stringify({ status, durationSeconds }),
  });
}

export function updateLimitedTimer(
  joinCode: string,
  token: string,
  sessionId: string,
  action: 'START' | 'PAUSE' | 'RESUME' | 'ADD',
  input: { durationSeconds?: number; seconds?: number; phase?: LimitedTimerPhase } = {},
) {
  return limitedSessionRequest(joinCode, token, sessionId, '/timer', {
    method: 'POST',
    body: JSON.stringify({ action, ...input }),
  });
}

export function startLimitedRound(joinCode: string, token: string, sessionId: string) {
  return limitedSessionRequest(joinCode, token, sessionId, '/rounds', { method: 'POST' });
}

export function reportLimitedResult(
  joinCode: string,
  token: string,
  sessionId: string,
  matchId: string,
  result: LimitedResultInput,
) {
  return limitedSessionRequest(
    joinCode,
    token,
    sessionId,
    `/matches/${matchId}/result`,
    { method: 'POST', body: JSON.stringify(result) },
  );
}

export function correctLimitedResult(
  joinCode: string,
  token: string,
  sessionId: string,
  matchId: string,
  result: LimitedResultInput & { correctionReason: string },
) {
  return limitedSessionRequest(
    joinCode,
    token,
    sessionId,
    `/matches/${matchId}/correct`,
    { method: 'POST', body: JSON.stringify(result) },
  );
}

export function dropLimitedParticipant(
  joinCode: string,
  token: string,
  sessionId: string,
  participantId?: string,
) {
  const suffix = participantId
    ? `/participants/${participantId}/drop`
    : '/drop';
  return limitedSessionRequest(joinCode, token, sessionId, suffix, { method: 'POST' });
}

export function cancelLimitedSession(joinCode: string, token: string, sessionId: string) {
  return limitedSessionRequest(joinCode, token, sessionId, '/cancel', { method: 'POST' });
}

export function completeLimitedSession(joinCode: string, token: string, sessionId: string) {
  return limitedSessionRequest(joinCode, token, sessionId, '/complete', { method: 'POST' });
}

/** Host-only: drops a player the pod has given up on from the roster. */
export function removeParticipant(
  joinCode: string,
  hostToken: string,
  participantId: string,
) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/participants/${participantId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${hostToken}` },
    },
  );
}

export function chooseGameTracker(
  joinCode: string,
  token: string,
  trackerUsed: boolean,
) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/tracker-choice`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trackerUsed }),
    },
  );
}

export function reportGameResult(
  joinCode: string,
  token: string,
  winnerParticipantId: string,
  durationSeconds: number,
) {
  return request<{ participant: PublicParticipant }>(
    `/events/${joinCode}/result`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ winnerParticipantId, durationSeconds }),
    },
  );
}

export function completeChallenge(
  joinCode: string,
  token: string,
  challengeId: string,
  input: {
    targetParticipantId: string;
    source: 'automatic' | 'confirmation' | 'manual';
    confirmed?: boolean;
  },
) {
  return request<{
    completion: PublicChallengeCompletion;
    created: boolean;
  }>(`/events/${joinCode}/challenges/${challengeId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function listTables(joinCode: string) {
  return request<{ tables: PublicTable[] }>(`/events/${joinCode}/tables`);
}

export function addTables(
  joinCode: string,
  token: string,
  input: { count?: number; labels?: string[] },
) {
  return request<{ tables: PublicTable[] }>(`/events/${joinCode}/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function setTableStatus(
  joinCode: string,
  token: string,
  tableId: string,
  status: 'free' | 'disabled',
) {
  return request<{ table: PublicTable }>(
    `/events/${joinCode}/tables/${tableId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    },
  );
}

export function matchNow(joinCode: string, token: string) {
  return request<{ pods: PublicPod[]; botsAdded: number }>(
    `/events/${joinCode}/match`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

type RoundSnapshotResult = {
  event: PublicEvent;
};

function roundMutation(
  joinCode: string,
  token: string,
  path: string,
  body?: Record<string, unknown>,
) {
  return request<RoundSnapshotResult>(`/events/${joinCode}/rounds${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Generate (or regenerate) the next synchronized round plan. */
export function generateEventRound(
  joinCode: string,
  token: string,
  expectedVersion?: number,
) {
  return roundMutation(
    joinCode,
    token,
    '/generate',
    expectedVersion === undefined ? undefined : { expectedVersion },
  );
}

export function publishEventRound(
  joinCode: string,
  token: string,
  expectedVersion: number,
) {
  return roundMutation(joinCode, token, '/publish', { expectedVersion });
}

export function startEventRound(
  joinCode: string,
  token: string,
  expectedVersion: number,
) {
  return roundMutation(joinCode, token, '/start', { expectedVersion });
}

export function completeEventRound(
  joinCode: string,
  token: string,
  expectedVersion: number,
  options?: { force?: boolean; forceReason?: string },
) {
  return roundMutation(joinCode, token, '/complete', {
    expectedVersion,
    ...options,
  });
}

/** Unlock selected assignments and re-optimize the rest (surgical repair). */
export function repairEventRound(
  joinCode: string,
  token: string,
  expectedVersion: number,
  unlockedAssignmentIds: string[],
) {
  return roundMutation(joinCode, token, '/repair', {
    expectedVersion,
    unlockedAssignmentIds,
  });
}

export function previewRepairEventRound(
  joinCode: string,
  token: string,
  expectedVersion: number,
  unlockedAssignmentIds: string[],
) {
  return request<{
    before: import('@podyguard/shared').PublicEventRound;
    after: import('@podyguard/shared').PublicEventRound;
    affectedAssignmentIds: string[];
    movingParticipantIds: string[];
  }>(`/events/${joinCode}/rounds/repair/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedVersion, unlockedAssignmentIds }),
  });
}

export function resolveEventRoundStaleBasis(
  joinCode: string,
  token: string,
  expectedVersion: number,
  decision: 'keep' | 'regenerate',
) {
  return roundMutation(joinCode, token, '/stale-basis', {
    expectedVersion,
    decision,
  });
}

export function swapEventRoundPlayers(
  joinCode: string,
  token: string,
  expectedVersion: number,
  leftAssignmentId: string,
  leftParticipantId: string,
  rightAssignmentId: string,
  rightParticipantId: string,
) {
  return roundMutation(joinCode, token, '/swap', {
    expectedVersion,
    leftAssignmentId,
    leftParticipantId,
    rightAssignmentId,
    rightParticipantId,
  });
}

export function reportEventRoundResult(
  joinCode: string,
  token: string,
  assignmentId: string,
  body: {
    expectedVersion: number;
    outcome?: DuelMatchOutcome;
    playerAGameWins?: number;
    playerBGameWins?: number;
  },
) {
  return request<RoundSnapshotResult>(
    `/events/${joinCode}/rounds/assignments/${assignmentId}/result`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
  );
}

export function dropEventRoundParticipant(
  joinCode: string,
  token: string,
  participantId: string,
  expectedVersion: number,
) {
  return roundMutation(
    joinCode,
    token,
    `/participants/${participantId}/drop`,
    { expectedVersion },
  );
}

export function markMissingEventRoundParticipant(
  joinCode: string,
  token: string,
  participantId: string,
  expectedVersion: number,
) {
  return roundMutation(
    joinCode,
    token,
    `/participants/${participantId}/mark-missing`,
    { expectedVersion },
  );
}

export function cancelEvent(joinCode: string, token: string) {
  return request<{ event: PublicEvent }>(`/events/${joinCode}/host/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function startTournament(joinCode: string, token: string) {
  return request<{ event: PublicEvent }>(
    `/events/${joinCode}/tournament/start`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function reportTournamentResult(
  joinCode: string,
  token: string,
  matchId: string,
  winnerParticipantId: string,
) {
  return request<{ event: PublicEvent }>(
    `/events/${joinCode}/tournament/matches/${matchId}/result`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ winnerParticipantId }),
    },
  );
}

export function setTournamentMatchBestOf(
  joinCode: string,
  token: string,
  matchId: string,
  bestOf: SeriesLength,
) {
  return request<{ event: PublicEvent }>(
    `/events/${joinCode}/tournament/matches/${matchId}/best-of`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bestOf }),
    },
  );
}

export function addLimitedFakePlayers(
  joinCode: string,
  token: string,
  input: { mode: LimitedMode; count: number },
) {
  return request<{ snapshot: EventSnapshot }>(
    `/events/${joinCode}/dev/limited-players`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

export function advanceLimitedFakes(
  joinCode: string,
  token: string,
  input: {
    action: 'ready' | 'seat' | 'seated' | 'ack' | 'report';
    mode?: LimitedMode;
    sessionId?: string;
  },
) {
  return request<{ snapshot: EventSnapshot }>(
    `/events/${joinCode}/dev/limited-fakes`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

export function fillTablesWithBots(joinCode: string, token: string) {
  return request<{ pods: PublicPod[]; botsAdded: number }>(
    `/events/${joinCode}/dev/fill-bots`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function startTable(joinCode: string, token: string, tableId: string) {
  return request<{ table: PublicTable }>(
    `/events/${joinCode}/tables/${tableId}/start`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function finishTable(joinCode: string, token: string, tableId: string) {
  return request<{ table: PublicTable }>(
    `/events/${joinCode}/tables/${tableId}/finish`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function cancelTable(joinCode: string, token: string, tableId: string) {
  return request<{ table: PublicTable }>(
    `/events/${joinCode}/tables/${tableId}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function updateMatchSettings(
  joinCode: string,
  token: string,
  patch: {
    allowThreePods?: boolean;
    allowFivePods?: boolean;
    preferredPodSize?: number;
    lifetimeHours?: number;
    showReturningPlayerSuggestions?: boolean;
  },
) {
  return request<{ event: PublicEvent }>(`/events/${joinCode}/settings`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
}

export function saveChallengePack(
  joinCode: string,
  token: string,
  body: { mode: 'copy-official' | 'from-scratch' | 'save'; pack?: unknown },
) {
  return request<{ event: PublicEvent }>(`/events/${joinCode}/pack`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function getEventMetrics(joinCode: string, token: string) {
  return request<{ metrics: EventMetrics }>(`/events/${joinCode}/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function ratePod(joinCode: string, token: string, rating: PodRating) {
  return request<{ rating: PodRating; alreadyRecorded: boolean }>(
    `/events/${joinCode}/pod-rating`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rating }),
    },
  );
}

/*
  Seat keys are stored per event and normalized the same way the server does,
  so `/e/abc-123` and `/e/ABC123` find the same session on the way back in.
*/
const HOST_KEY = (joinCode: string) =>
  `podyguard.host.${normalizeJoinCode(joinCode)}`;
const PLAYER_KEY = (joinCode: string) =>
  `podyguard.player.${normalizeJoinCode(joinCode)}`;

export function saveHostToken(joinCode: string, token: string) {
  writeStored(HOST_KEY(joinCode), token);
}

export function loadHostToken(joinCode: string) {
  return readStored(HOST_KEY(joinCode));
}

/** For a token the server has stopped honouring; the host can re-enter the PIN. */
export function clearHostToken(joinCode: string) {
  removeStored(HOST_KEY(joinCode));
}

export function savePlayerSession(
  joinCode: string,
  session: { token: string; displayName: string },
) {
  writeStored(PLAYER_KEY(joinCode), JSON.stringify(session));
}

export function loadPlayerSession(joinCode: string) {
  const raw = readStored(PLAYER_KEY(joinCode));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { token: string; displayName: string };
  } catch {
    return null;
  }
}

/**
 * Forgets the seat. Only for a session the server has refused: a durable key
 * that no longer opens anything would otherwise sit in front of the join form
 * for good.
 */
export function clearPlayerSession(joinCode: string) {
  removeStored(PLAYER_KEY(joinCode));
}

const DISPLAY_TOKEN_KEY = 'podyguard.display.token';
const DISPLAY_SESSION_KEY = 'podyguard.display.sessionId';

export function saveDisplayToken(token: string, sessionId?: string) {
  writeStored(DISPLAY_TOKEN_KEY, token);
  if (sessionId) {
    writeStored(DISPLAY_SESSION_KEY, sessionId);
  }
}

export function loadDisplayToken() {
  return readStored(DISPLAY_TOKEN_KEY);
}

export function loadDisplaySessionId() {
  return readStored(DISPLAY_SESSION_KEY);
}

export function clearDisplayToken() {
  removeStored(DISPLAY_TOKEN_KEY);
  removeStored(DISPLAY_SESSION_KEY);
}

export function beginDisplayPairing() {
  return request<{
    sessionId: string;
    pairingCode: string;
    expiresAt: string;
  }>('/displays/pair', { method: 'POST' });
}

export function pollDisplayPairing(sessionId: string) {
  return request<{
    status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
    expiresAt?: string;
  }>(`/displays/pair/${sessionId}`);
}

export function claimDisplayToken(sessionId: string) {
  return request<{ token: string }>(`/displays/pair/${sessionId}/claim`, {
    method: 'POST',
  });
}

export function getDisplayState(token: string) {
  return request<{ state: PublicDisplayEventState }>('/displays/state', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function approveDisplay(
  joinCode: string,
  hostToken: string,
  input: {
    pairingCode: string;
    label?: string;
    mode?: DisplayMode;
    showPlayerNames?: boolean;
  },
) {
  return request<{ display: HostDisplaySession }>(
    `/events/${joinCode}/displays/approve`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
      body: JSON.stringify(input),
    },
  );
}

export function listDisplays(joinCode: string, hostToken: string) {
  return request<{ displays: HostDisplaySession[] }>(
    `/events/${joinCode}/displays`,
    { headers: { Authorization: `Bearer ${hostToken}` } },
  );
}

export function updateDisplay(
  joinCode: string,
  hostToken: string,
  displayId: string,
  patch: {
    label?: string;
    mode?: DisplayMode;
    showPlayerNames?: boolean;
    showQueues?: boolean;
    showTimers?: boolean;
  },
) {
  return request<{ display: HostDisplaySession }>(
    `/events/${joinCode}/displays/${displayId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hostToken}` },
      body: JSON.stringify(patch),
    },
  );
}

export function revokeDisplay(
  joinCode: string,
  hostToken: string,
  displayId: string,
) {
  return request<{ display: HostDisplaySession }>(
    `/events/${joinCode}/displays/${displayId}/revoke`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
    },
  );
}

export function createDisplayAnnouncement(
  joinCode: string,
  hostToken: string,
  input: { message: string; durationSeconds?: number },
) {
  return request<{ announcement: PublicDisplayAnnouncement }>(
    `/events/${joinCode}/announcements`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
      body: JSON.stringify(input),
    },
  );
}

export function cancelDisplayAnnouncement(
  joinCode: string,
  hostToken: string,
  announcementId: string,
) {
  return request<{ ok: true }>(
    `/events/${joinCode}/announcements/${announcementId}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
    },
  );
}

const ACCOUNT_SESSION_KEY = 'podyguard.account.session';
const PREFERRED_PLAYGROUP_KEY = 'podyguard.account.preferredPlaygroupId';

export type StoredAccountSession = {
  token: string;
  account: UserAccount;
};

export function saveAccountSession(session: StoredAccountSession) {
  writeStored(ACCOUNT_SESSION_KEY, JSON.stringify(session));
}

export function loadAccountSession(): StoredAccountSession | null {
  const raw = readStored(ACCOUNT_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAccountSession;
    if (
      typeof parsed?.token === 'string' &&
      parsed.token.length > 0 &&
      parsed.account &&
      typeof parsed.account.id === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadAccountToken(): string | null {
  return loadAccountSession()?.token ?? null;
}

export function clearAccountSession() {
  removeStored(ACCOUNT_SESSION_KEY);
}

export function savePreferredPlaygroupId(playgroupId: string | null) {
  if (!playgroupId) {
    removeStored(PREFERRED_PLAYGROUP_KEY);
    return;
  }
  writeStored(PREFERRED_PLAYGROUP_KEY, playgroupId);
}

export function loadPreferredPlaygroupId(): string | null {
  return readStored(PREFERRED_PLAYGROUP_KEY);
}

export function startEmailAuth(email: string, displayName?: string) {
  return request<{
    challengeId: string;
    email: string;
    expiresAt: string;
    devCode?: string;
  }>('/auth/email/start', {
    method: 'POST',
    body: JSON.stringify({ email, displayName }),
  });
}

export function verifyEmailAuth(
  email: string,
  code: string,
  displayName?: string,
) {
  return request<{
    account: UserAccount;
    token: string;
    playgroups: Playgroup[];
  }>('/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code, displayName }),
  });
}

export function getMyAccount(token: string) {
  return request<{
    account: UserAccount;
    playgroups: Playgroup[];
    stats: DerivedStats;
    recentGames: GameRecord[];
    linkedGuests: GuestProfile[];
    claimableGuests: Array<{ guest: GuestProfile; playgroupName: string }>;
  }>('/account/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateMyAccount(token: string, displayName: string) {
  return request<{ account: UserAccount }>('/account/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  });
}

export function deleteMyAccount(token: string) {
  return request<{ ok: true }>('/account/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function claimGuestHistory(token: string, guestProfileId: string) {
  return request<{ guest: GuestProfile }>('/account/claim-guest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ guestProfileId }),
  });
}

export function listMyPlaygroups(token: string) {
  return request<{ playgroups: Playgroup[] }>('/playgroups', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createPlaygroup(
  token: string,
  name: string,
  guestIdentityVerification?: GuestIdentityVerification,
) {
  return request<{ playgroup: Playgroup }>('/playgroups', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, guestIdentityVerification }),
  });
}

export function getPlaygroupOverview(token: string, playgroupId: string) {
  return request<{ overview: PlaygroupOverview }>(`/playgroups/${playgroupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updatePlaygroup(
  token: string,
  playgroupId: string,
  patch: {
    name?: string;
    guestIdentityVerification?: GuestIdentityVerification;
  },
) {
  return request<{ playgroup: Playgroup }>(`/playgroups/${playgroupId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
}

export function deletePlaygroup(token: string, playgroupId: string) {
  return request<{ ok: true }>(`/playgroups/${playgroupId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createGuestProfile(
  token: string,
  playgroupId: string,
  displayName: string,
  allowDuplicate?: boolean,
) {
  return request<{ guest: GuestProfile }>(`/playgroups/${playgroupId}/guests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName, allowDuplicate }),
  });
}

export function updateGuestProfile(
  token: string,
  playgroupId: string,
  guestId: string,
  patch: { displayName?: string; archived?: boolean },
) {
  return request<{ guest: GuestProfile }>(
    `/playgroups/${playgroupId}/guests/${guestId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    },
  );
}

export function deleteGuestProfile(
  token: string,
  playgroupId: string,
  guestId: string,
) {
  return request<{ ok: true }>(`/playgroups/${playgroupId}/guests/${guestId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function mergeGuestProfiles(
  token: string,
  playgroupId: string,
  sourceGuestId: string,
  targetGuestId: string,
) {
  return request<{ guest: GuestProfile }>(
    `/playgroups/${playgroupId}/guests/${sourceGuestId}/merge`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetGuestId }),
    },
  );
}

export function createSavedDeckProfile(
  token: string,
  playgroupId: string,
  guestId: string,
  input: {
    format?: string;
    deckName?: string;
    commanderName?: string;
    commanderScryfallId?: string;
    commanders?: CommanderSelection[];
    bracket?: number;
    poolId?: string;
    preferred?: boolean;
  },
) {
  return request<{ deck: SavedDeckProfile }>(
    `/playgroups/${playgroupId}/guests/${guestId}/decks`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

export function updateSavedDeckProfile(
  token: string,
  playgroupId: string,
  guestId: string,
  deckId: string,
  patch: {
    format?: string;
    deckName?: string;
    commanderName?: string;
    commanderScryfallId?: string;
    commanders?: CommanderSelection[];
    bracket?: number;
    poolId?: string;
    preferred?: boolean;
    archived?: boolean;
  },
) {
  return request<{ deck: SavedDeckProfile }>(
    `/playgroups/${playgroupId}/guests/${guestId}/decks/${deckId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    },
  );
}

export function deleteSavedDeckProfile(
  token: string,
  playgroupId: string,
  guestId: string,
  deckId: string,
) {
  return request<{ ok: true }>(
    `/playgroups/${playgroupId}/guests/${guestId}/decks/${deckId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export function recordLocalPlaygroupGame(
  token: string,
  playgroupId: string,
  input: {
    clientGameId: string;
    gameMode: GameMode;
    rulesFormat?: 'normal' | 'commander';
    poolId?: string;
    durationSeconds?: number;
    startedAt?: string;
    endedAt?: string;
    seats: Array<{
      guestProfileId?: string;
      userAccountId?: string;
      displayName: string;
      savedDeckProfileId?: string;
      deckName?: string;
      commanderName?: string;
      commanderScryfallId?: string;
      bracket?: number;
      resultType?: GameResultType;
      placement?: number;
      teamId?: string;
    }>;
  },
) {
  return request<{ gameRecord: GameRecord }>(
    `/playgroups/${playgroupId}/games`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    },
  );
}

