import {
  normalizeJoinCode,
  type EventMetrics,
  type GameMode,
  type PodRating,
  type PublicEvent,
  type PublicChallengeCompletion,
  type PublicParticipant,
  type PublicPod,
  type PublicTable,
  type TreacheryRoleAssignment,
  type TournamentFormat,
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
    tournamentFormat?: TournamentFormat;
  },
) {
  return request<{ event: PublicEvent; hostToken: string }>('/events', {
    method: 'POST',
    body: JSON.stringify({ name, hostPin, tableCount, ...options }),
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

export function joinEvent(
  joinCode: string,
  displayName: string,
  decks?: DeckDraft[],
) {
  return request<{
    event: PublicEvent;
    participant: PublicParticipant;
    token: string;
  }>(`/events/${joinCode}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName, decks }),
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
