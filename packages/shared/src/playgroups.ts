import type { CommanderSelection, PublicEvent } from './event-api';
import { usesCommanderRules, type GameMode, type RulesFormat } from './treachery';

export const GUEST_IDENTITY_VERIFICATION_MODES = [
  'NONE',
  'HOST_CONFIRM',
] as const;

export type GuestIdentityVerification =
  (typeof GUEST_IDENTITY_VERIFICATION_MODES)[number];

export const GAME_SOURCES = [
  'PODYGUARD',
  'PLAYGROUP_GG',
  'MYTHIC_TOOLS',
  'LIFETAP',
  'FILE_IMPORT',
  'MANUAL',
] as const;

export type GameSource = (typeof GAME_SOURCES)[number];

export const GAME_SOURCE_TYPES = [
  'EVENT_POD',
  'ROUND_ASSIGNMENT',
  'LIMITED_MATCH',
  'LOCAL_PLAY',
  'MANUAL',
] as const;

export type GameSourceType = (typeof GAME_SOURCE_TYPES)[number];

export const GAME_RESULT_TYPES = [
  'WIN',
  'LOSS',
  'DRAW',
  'COMPLETED_NO_WINNER',
  'BYE',
] as const;

export type GameResultType = (typeof GAME_RESULT_TYPES)[number];

export type UserAccount = {
  id: string;
  authUserId: string;
  email?: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type Playgroup = {
  id: string;
  ownerUserId: string;
  name: string;
  guestIdentityVerification: GuestIdentityVerification;
  createdAt: string;
  updatedAt: string;
};

export type GuestProfile = {
  id: string;
  playgroupId: string;
  displayName: string;
  linkedUserAccountId?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
};

export type SavedDeckProfile = {
  id: string;
  playgroupId: string;
  guestProfileId: string;
  format: string;
  deckName?: string;
  commanderName?: string;
  commanderScryfallId?: string;
  commanders: CommanderSelection[];
  bracket?: number;
  poolId: string;
  preferred?: boolean;
  timesUsed: number;
  lastUsedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Privacy-safe join suggestion projection.
 * Never exposes internal playgroup metadata, user account IDs, or stats.
 */
export type JoinGuestSuggestion = {
  id: string;
  displayName: string;
};

export type JoinGuestSuggestionsResponse = {
  suggestions: JoinGuestSuggestion[];
  totalCount: number;
  mode: 'none' | 'list' | 'search';
};

/**
 * Registration-only projection of a guest's saved deck configuration.
 */
export type JoinSavedDeckSuggestion = {
  id: string;
  deckName?: string;
  commanderName?: string;
  commanderScryfallId?: string;
  commanders: CommanderSelection[];
  bracket?: number;
  poolId: string;
  format: string;
  preferred: boolean;
  lastUsedAt?: string;
};

export type GameRecordParticipant = {
  id: string;
  gameRecordId: string;
  eventParticipantId?: string;
  userAccountId?: string;
  guestProfileId?: string;
  displayNameSnapshot: string;
  savedDeckProfileId?: string;
  deckNameSnapshot?: string;
  commanderNameSnapshot?: string;
  commanderScryfallIdSnapshot?: string;
  bracketSnapshot?: number;
  resultType?: GameResultType;
  placement?: number;
  teamId?: string;
};

export type GameRecord = {
  id: string;
  source: GameSource;
  sourceType: GameSourceType;
  sourceId: string;
  eventId?: string;
  playgroupId?: string;
  gameMode: string;
  format?: string;
  poolId?: string;
  durationSeconds?: number;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  participants: GameRecordParticipant[];
};

export type CommanderUsageStat = {
  commanderName: string;
  commanderScryfallId?: string;
  deckName?: string;
  bracket?: number;
  games: number;
  wins: number;
  lastUsedAt?: string;
};

export type PlayedWithStat = {
  guestProfileId?: string;
  userAccountId?: string;
  displayName: string;
  gamesTogether: number;
};

export type DerivedStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  completedNoWinner: number;
  /** Win rate over games that recorded a decided or drawn result (WIN/LOSS/DRAW). Null when none. */
  winRate: number | null;
  gamesByFormat: Record<string, number>;
  mostUsedCommanders: CommanderUsageStat[];
  mostPlayedWith: PlayedWithStat[];
  lastPlayedAt: string | null;
};

export type PlaygroupGuestOverview = {
  guest: GuestProfile;
  savedDecks: SavedDeckProfile[];
  stats: DerivedStats;
};

export type RecentPlaygroupEventConfig = {
  name: string;
  gameMode: GameMode;
  rulesFormat: RulesFormat;
  tableCount: number;
  preferredPodSize: number;
  allowThreePods: boolean;
  allowFivePods: boolean;
  operationMode: 'ROLLING' | 'ROUNDS';
  lifetimeHours: number;
  showReturningPlayerSuggestions: boolean;
};

export type PlaygroupOverview = {
  playgroup: Playgroup;
  playerCount: number;
  recordedGamesCount: number;
  guests: PlaygroupGuestOverview[];
  recentGames: GameRecord[];
  lastEventConfig?: RecentPlaygroupEventConfig;
};

export const SMALL_PLAYGROUP_SUGGESTION_LIMIT = 12;
export const LARGE_PLAYGROUP_SEARCH_LIMIT = 10;

export function poolIdFromBracket(bracket?: number | null): string {
  if (bracket === 1 || bracket === 2 || bracket === 3 || bracket === 4) {
    return `b${bracket}`;
  }
  return 'open';
}

export function bracketFromPoolId(poolId?: string | null): number | undefined {
  if (!poolId) return undefined;
  const normalized = poolId.trim().toLowerCase();
  if (normalized === 'b1') return 1;
  if (normalized === 'b2') return 2;
  if (normalized === 'b3') return 3;
  if (normalized === 'b4') return 4;
  return undefined;
}

/**
 * Checks whether a saved deck profile is valid for the target event's rules and constraints.
 * Prevents invalid format/deck configs from being offered or reused during join.
 */
export function isSavedDeckCompatibleWithEvent(
  deck: Pick<
    SavedDeckProfile,
    'format' | 'commanderName' | 'commanders' | 'bracket' | 'poolId' | 'archivedAt'
  >,
  event: Pick<PublicEvent, 'gameMode' | 'rulesFormat' | 'limitedModeConfigs'>,
): boolean {
  if (deck.archivedAt) {
    return false;
  }
  const hasLimited = (event.limitedModeConfigs ?? []).some((row) => row.enabled);
  if (hasLimited) {
    return false;
  }
  const commanderRules = usesCommanderRules(event.gameMode, event.rulesFormat);
  const deckFormat = deck.format.trim().toLowerCase();

  if (commanderRules) {
    const validFormats = new Set(['commander', 'duel-commander', 'brawl', 'edh']);
    if (!validFormats.has(deckFormat)) {
      return false;
    }
    if (event.gameMode === 'duel-commander' && deckFormat === 'brawl') {
      return false;
    }
    if (event.gameMode === 'brawl' && deckFormat === 'duel-commander') {
      return false;
    }
    const hasCommander =
      (deck.commanders && deck.commanders.length > 0) ||
      Boolean(deck.commanderName && deck.commanderName.trim().length > 0);
    if (!hasCommander) {
      return false;
    }
    const bracket = deck.bracket ?? bracketFromPoolId(deck.poolId);
    if (bracket !== undefined && (bracket < 1 || bracket > 4)) {
      return false;
    }
    return true;
  }

  // Classic / normal format event (non-commander)
  if (deckFormat === 'commander' || deckFormat === 'duel-commander' || deckFormat === 'brawl') {
    return false;
  }
  return deckFormat === 'normal' || deckFormat === 'constructed' || deckFormat === 'open';
}

export function buildFallbackCommanderSelection(input: {
  commanderName: string;
  commanderScryfallId?: string;
}): CommanderSelection {
  const trimmedName = input.commanderName.trim();
  const slug =
    input.commanderScryfallId?.trim() ||
    `seeded-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'commander'}`;
  return {
    oracleId: slug,
    cardId: slug,
    name: trimmedName,
    artCropUri: 'https://cards.scryfall.io/art_crop/front/0/0/00000000-0000-0000-0000-000000000000.jpg',
    typeLine: 'Legendary Creature',
    oracleText: '',
    keywords: [],
  };
}

export function deriveStatsForIdentity(
  records: readonly GameRecord[],
  target: {
    guestProfileIds?: readonly string[];
    userAccountIds?: readonly string[];
  },
  currentNames?: {
    byGuestId?: ReadonlyMap<string, string>;
    byUserId?: ReadonlyMap<string, string>;
  },
): DerivedStats {
  const guestIds = new Set(target.guestProfileIds ?? []);
  const userIds = new Set(target.userAccountIds ?? []);

  let gamesPlayed = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let completedNoWinner = 0;
  const gamesByFormat: Record<string, number> = {};
  let lastPlayedAt: string | null = null;

  const commanderMap = new Map<
    string,
    {
      commanderName: string;
      commanderScryfallId?: string;
      deckName?: string;
      bracket?: number;
      games: number;
      wins: number;
      lastUsedAt?: string;
    }
  >();

  const playedWithMap = new Map<
    string,
    {
      guestProfileId?: string;
      userAccountId?: string;
      displayName: string;
      gamesTogether: number;
    }
  >();

  for (const record of records) {
    const matchingSeats = record.participants.filter(
      (p) =>
        (p.guestProfileId && guestIds.has(p.guestProfileId)) ||
        (p.userAccountId && userIds.has(p.userAccountId)),
    );
    if (matchingSeats.length === 0) {
      continue;
    }
    const seat = matchingSeats[0]!;
    if (seat.resultType === 'BYE') {
      continue;
    }

    gamesPlayed += 1;
    if (seat.resultType === 'WIN') {
      wins += 1;
    } else if (seat.resultType === 'LOSS') {
      losses += 1;
    } else if (seat.resultType === 'DRAW') {
      draws += 1;
    } else {
      completedNoWinner += 1;
    }

    const formatKey = record.gameMode || record.format || 'commander';
    gamesByFormat[formatKey] = (gamesByFormat[formatKey] ?? 0) + 1;

    const timestamp = record.endedAt ?? record.startedAt ?? record.createdAt;
    if (!lastPlayedAt || timestamp > lastPlayedAt) {
      lastPlayedAt = timestamp;
    }

    const cmdName = seat.commanderNameSnapshot ?? seat.deckNameSnapshot;
    if (cmdName) {
      const cmdKey =
        seat.commanderScryfallIdSnapshot?.toLowerCase() ||
        `${cmdName.toLowerCase()}::${seat.bracketSnapshot ?? ''}`;
      const existing = commanderMap.get(cmdKey);
      if (existing) {
        existing.games += 1;
        if (seat.resultType === 'WIN') {
          existing.wins += 1;
        }
        if (!existing.lastUsedAt || timestamp > existing.lastUsedAt) {
          existing.lastUsedAt = timestamp;
        }
      } else {
        commanderMap.set(cmdKey, {
          commanderName: cmdName,
          ...(seat.commanderScryfallIdSnapshot
            ? { commanderScryfallId: seat.commanderScryfallIdSnapshot }
            : {}),
          ...(seat.deckNameSnapshot ? { deckName: seat.deckNameSnapshot } : {}),
          ...(seat.bracketSnapshot !== undefined
            ? { bracket: seat.bracketSnapshot }
            : {}),
          games: 1,
          wins: seat.resultType === 'WIN' ? 1 : 0,
          lastUsedAt: timestamp,
        });
      }
    }

    const seenCoPlayersInGame = new Set<string>();
    for (const other of record.participants) {
      if (other.id === seat.id) continue;
      if (
        (other.guestProfileId && guestIds.has(other.guestProfileId)) ||
        (other.userAccountId && userIds.has(other.userAccountId))
      ) {
        continue;
      }
      const otherKey = other.guestProfileId
        ? `guest:${other.guestProfileId}`
        : other.userAccountId
          ? `user:${other.userAccountId}`
          : `name:${other.displayNameSnapshot.toLowerCase()}`;
      if (seenCoPlayersInGame.has(otherKey)) {
        continue;
      }
      seenCoPlayersInGame.add(otherKey);

      const resolvedName =
        (other.guestProfileId && currentNames?.byGuestId?.get(other.guestProfileId)) ||
        (other.userAccountId && currentNames?.byUserId?.get(other.userAccountId)) ||
        other.displayNameSnapshot;

      const existing = playedWithMap.get(otherKey);
      if (existing) {
        existing.gamesTogether += 1;
        existing.displayName = resolvedName;
      } else {
        playedWithMap.set(otherKey, {
          ...(other.guestProfileId ? { guestProfileId: other.guestProfileId } : {}),
          ...(other.userAccountId ? { userAccountId: other.userAccountId } : {}),
          displayName: resolvedName,
          gamesTogether: 1,
        });
      }
    }
  }

  const decidedTotal = wins + losses + draws;
  const winRate = decidedTotal > 0 ? wins / decidedTotal : null;

  const mostUsedCommanders = [...commanderMap.values()].sort(
    (a, b) =>
      b.games - a.games ||
      b.wins - a.wins ||
      (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') ||
      a.commanderName.localeCompare(b.commanderName),
  );

  const mostPlayedWith = [...playedWithMap.values()].sort(
    (a, b) =>
      b.gamesTogether - a.gamesTogether ||
      a.displayName.localeCompare(b.displayName),
  );

  return {
    gamesPlayed,
    wins,
    losses,
    draws,
    completedNoWinner,
    winRate,
    gamesByFormat,
    mostUsedCommanders,
    mostPlayedWith,
    lastPlayedAt,
  };
}
