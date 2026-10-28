import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import {
  LARGE_PLAYGROUP_SEARCH_LIMIT,
  SMALL_PLAYGROUP_SUGGESTION_LIMIT,
  bracketFromPoolId,
  buildFallbackCommanderSelection,
  deriveStatsForIdentity,
  isSavedDeckCompatibleWithEvent,
  poolIdFromBracket,
  usesCommanderRules,
  type CommanderSelection,
  type DerivedStats,
  type GameMode,
  type GameRecord,
  type GameResultType,
  type GuestIdentityVerification,
  type GuestProfile,
  type JoinGuestSuggestion,
  type JoinGuestSuggestionsResponse,
  type JoinSavedDeckSuggestion,
  type Playgroup,
  type PlaygroupOverview,
  type PublicEvent,
  type RecentPlaygroupEventConfig,
  type RulesFormat,
  type SavedDeckProfile,
  type UserAccount,
} from '@podyguard/shared';
import {
  bindingFromNeonAuthAccount,
  InvalidAccountSessionError,
  toHostIdentity,
  type IdentityBoundary,
} from '../identity/index.js';
import {
  DuplicateGuestNameError,
  GuestProfileNotFoundError,
  PlaygroupForbiddenError,
  PlaygroupNotFoundError,
  SavedDeckNotFoundError,
  type EventStore,
  type StoredDeck,
  type StoredEvent,
  type StoredGameRecord,
  type StoredGuestProfile,
  type StoredLimitedMatch,
  type StoredLimitedSession,
  type StoredParticipant,
  type StoredPlaygroup,
  type StoredSavedDeckProfile,
  type StoredUserAccount,
} from './event-store.js';
import { assertDisplayName, InvalidEventInputError } from './validation.js';

const AUTH_CHALLENGE_TTL_MS = 15 * 60 * 1000;
const AUTH_CHALLENGE_MAX_ATTEMPTS = 8;

export class AuthChallengeInvalidError extends Error {
  readonly code = 'AUTH_CHALLENGE_INVALID';

  constructor(message = 'Verification code is invalid or expired.') {
    super(message);
    this.name = 'AuthChallengeInvalidError';
  }
}

export class AuthChallengeRateLimitedError extends Error {
  readonly code = 'AUTH_CHALLENGE_RATE_LIMITED';

  constructor() {
    super('Too many verification attempts. Request a new code.');
    this.name = 'AuthChallengeRateLimitedError';
  }
}

export function assertEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 160 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new InvalidEventInputError('Enter a valid email address.');
  }
  return normalized;
}

export function assertPlaygroupName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 60) {
    throw new InvalidEventInputError(
      'Playgroup name must be between 1 and 60 characters.',
    );
  }
  return trimmed;
}

function hashOtpCode(email: string, code: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`email-otp:${email.toLowerCase()}:${code}`)
    .digest('base64url');
}

function otpSecret(): string {
  return (
    process.env.PARTICIPANT_SESSION_SECRET?.trim() ||
    'dev-podyguard-session-secret'
  );
}

export async function startEmailAuthFlow(
  store: EventStore,
  options: { now: Date; exposeDevCode: boolean },
  input: { email: string; displayName?: string },
): Promise<{
  challengeId: string;
  email: string;
  expiresAt: string;
  devCode?: string;
}> {
  const email = assertEmail(input.email);
  const displayName = input.displayName?.trim()
    ? assertDisplayName(input.displayName)
    : undefined;
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(options.now.getTime() + AUTH_CHALLENGE_TTL_MS);
  const challenge = await store.insertAuthChallenge({
    email,
    displayName: displayName ?? null,
    codeHash: hashOtpCode(email, code, otpSecret()),
    expiresAt,
  });
  return {
    challengeId: challenge.id,
    email,
    expiresAt: expiresAt.toISOString(),
    ...(options.exposeDevCode ? { devCode: code } : {}),
  };
}

export async function verifyEmailAuthFlow(
  store: EventStore,
  identity: IdentityBoundary,
  options: { now: Date },
  input: { email: string; code: string; displayName?: string },
): Promise<{
  account: UserAccount;
  token: string;
  playgroups: Playgroup[];
}> {
  const email = assertEmail(input.email);
  const digits = input.code.replace(/\D/g, '');
  if (digits.length !== 6) {
    throw new AuthChallengeInvalidError();
  }
  const challenge = await store.findLatestAuthChallengeByEmail(email);
  if (!challenge || challenge.consumedAt !== null) {
    throw new AuthChallengeInvalidError();
  }
  if (challenge.attempts >= AUTH_CHALLENGE_MAX_ATTEMPTS) {
    throw new AuthChallengeRateLimitedError();
  }
  if (challenge.expiresAt.getTime() <= options.now.getTime()) {
    throw new AuthChallengeInvalidError('Verification code has expired.');
  }
  const expected = Buffer.from(challenge.codeHash);
  const actual = Buffer.from(hashOtpCode(email, digits, otpSecret()));
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    await store.incrementAuthChallengeAttempts(challenge.id);
    throw new AuthChallengeInvalidError();
  }

  await store.consumeAuthChallenge(challenge.id, options.now);
  const existing = await store.findUserAccountByEmail(email);
  const fallbackName = email.split('@')[0]?.slice(0, 24) || 'Host';
  const rawDisplayName =
    input.displayName?.trim() ||
    challenge.displayName ||
    existing?.displayName ||
    fallbackName;
  const displayName = assertDisplayName(rawDisplayName.slice(0, 24));

  const account = await store.upsertUserAccount({
    authUserId: `email:${email}`,
    email,
    displayName,
  });
  const session = identity.accountSessions.issue(account.id);
  const playgroups = await store.listPlaygroupsByOwner(account.id);
  return {
    account: toPublicUserAccount(account),
    token: session.token,
    playgroups: playgroups.map(toPublicPlaygroup),
  };
}

export async function loginWithNeonAuthFlow(
  store: EventStore,
  identity: IdentityBoundary,
  input: { neonUserId: string; email?: string | null; displayName?: string },
): Promise<{
  account: UserAccount;
  token: string;
  playgroups: Playgroup[];
}> {
  const neonId = input.neonUserId.trim();
  if (!neonId) {
    throw new InvalidEventInputError('neonUserId is required.');
  }
  const email = input.email?.trim() ? assertEmail(input.email) : null;
  const fallbackName =
    input.displayName?.trim() ||
    (email ? email.split('@')[0] : undefined) ||
    'Host';
  const displayName = assertDisplayName(fallbackName.slice(0, 24));
  const account = await store.upsertUserAccount({
    authUserId: `neon:${neonId}`,
    email,
    displayName,
  });
  const binding = bindingFromNeonAuthAccount(
    { neonUserId: neonId, email },
    account.id,
  );
  const hostIdentity = toHostIdentity(binding);
  const session = identity.accountSessions.issue(hostIdentity.accountId);
  const playgroups = await store.listPlaygroupsByOwner(account.id);
  return {
    account: toPublicUserAccount(account),
    token: session.token,
    playgroups: playgroups.map(toPublicPlaygroup),
  };
}

export async function requireAuthenticatedAccount(
  store: EventStore,
  identity: IdentityBoundary,
  accountToken: string,
): Promise<StoredUserAccount> {
  if (!accountToken) {
    throw new InvalidAccountSessionError();
  }
  const hostIdentity = identity.accountSessions.verify(accountToken);
  const account = await store.findUserAccountById(hostIdentity.accountId);
  if (!account) {
    throw new InvalidAccountSessionError();
  }
  return account;
}

export async function tryResolveAuthenticatedAccount(
  store: EventStore,
  identity: IdentityBoundary,
  accountToken: string | undefined,
): Promise<StoredUserAccount | undefined> {
  if (!accountToken || !accountToken.startsWith('as1.')) {
    return undefined;
  }
  try {
    return await requireAuthenticatedAccount(store, identity, accountToken);
  } catch {
    return undefined;
  }
}

export async function requireOwnedPlaygroup(
  store: EventStore,
  identity: IdentityBoundary,
  accountToken: string,
  playgroupId: string,
): Promise<{ account: StoredUserAccount; playgroup: StoredPlaygroup }> {
  const account = await requireAuthenticatedAccount(
    store,
    identity,
    accountToken,
  );
  const playgroup = await store.findPlaygroupById(playgroupId);
  if (!playgroup) {
    throw new PlaygroupNotFoundError();
  }
  if (playgroup.ownerUserId !== account.id) {
    throw new PlaygroupForbiddenError();
  }
  return { account, playgroup };
}

export async function buildPlaygroupOverview(
  store: EventStore,
  playgroup: StoredPlaygroup,
): Promise<PlaygroupOverview> {
  const [guests, decks, records, events] = await Promise.all([
    store.listGuestProfilesByPlaygroup(playgroup.id),
    store.listSavedDeckProfilesByPlaygroup(playgroup.id),
    store.listGameRecordsByPlaygroup(playgroup.id),
    store.listEventsByPlaygroup(playgroup.id),
  ]);

  const publicRecords = records.map(toPublicGameRecord);
  const byGuestId = new Map(guests.map((g) => [g.id, g.displayName]));

  const guestOverviews = guests.map((guest) => {
    const guestDecks = decks
      .filter((d) => d.guestProfileId === guest.id)
      .map(toPublicSavedDeckProfile);
    const stats = deriveStatsForIdentity(
      publicRecords,
      {
        guestProfileIds: [guest.id],
        ...(guest.linkedUserAccountId
          ? { userAccountIds: [guest.linkedUserAccountId] }
          : {}),
      },
      { byGuestId },
    );
    return {
      guest: toPublicGuestProfile(guest),
      savedDecks: guestDecks,
      stats,
    };
  });

  let lastEventConfig: RecentPlaygroupEventConfig | undefined;
  const latestEvent = events[0];
  if (latestEvent) {
    const tables = await store.listTables(latestEvent.id);
    lastEventConfig = {
      name: latestEvent.name,
      gameMode: latestEvent.gameMode,
      rulesFormat: latestEvent.rulesFormat,
      tableCount: Math.max(1, tables.length),
      preferredPodSize: latestEvent.preferredPodSize,
      allowThreePods: latestEvent.allowThreePods,
      allowFivePods: latestEvent.allowFivePods,
      operationMode:
        latestEvent.operationMode === 'ROUNDS' ? 'ROUNDS' : 'ROLLING',
      lifetimeHours: Math.max(
        1,
        Math.round(
          (latestEvent.expiresAt.getTime() - latestEvent.createdAt.getTime()) /
            (60 * 60 * 1000),
        ),
      ),
      showReturningPlayerSuggestions:
        latestEvent.showReturningPlayerSuggestions,
    };
  }

  return {
    playgroup: toPublicPlaygroup(playgroup),
    playerCount: guests.length,
    recordedGamesCount: publicRecords.length,
    guests: guestOverviews,
    recentGames: publicRecords.slice(0, 50),
    ...(lastEventConfig ? { lastEventConfig } : {}),
  };
}

export async function buildAccountDashboard(
  store: EventStore,
  account: StoredUserAccount,
): Promise<{
  account: UserAccount;
  playgroups: Playgroup[];
  stats: DerivedStats;
  recentGames: GameRecord[];
  linkedGuests: GuestProfile[];
  claimableGuests: Array<{ guest: GuestProfile; playgroupName: string }>;
}> {
  const [playgroups, linkedGuests] = await Promise.all([
    store.listPlaygroupsByOwner(account.id),
    store.listGuestProfilesByLinkedUser(account.id),
  ]);
  const linkedGuestIds = linkedGuests.map((g) => g.id);
  const records = await store.listGameRecordsForIdentity({
    userAccountIds: [account.id],
    guestProfileIds: linkedGuestIds,
  });
  const publicRecords = records.map(toPublicGameRecord);
  const stats = deriveStatsForIdentity(publicRecords, {
    userAccountIds: [account.id],
    guestProfileIds: linkedGuestIds,
  });

  // Find unlinked guests in user's own playgroups with matching displayName so user can optionally claim them
  const claimableGuests: Array<{ guest: GuestProfile; playgroupName: string }> =
    [];
  for (const pg of playgroups) {
    const pgGuests = await store.listGuestProfilesByPlaygroup(pg.id);
    for (const guest of pgGuests) {
      if (
        !guest.linkedUserAccountId &&
        guest.displayName.toLowerCase() === account.displayName.toLowerCase()
      ) {
        claimableGuests.push({
          guest: toPublicGuestProfile(guest),
          playgroupName: pg.name,
        });
      }
    }
  }

  return {
    account: toPublicUserAccount(account),
    playgroups: playgroups.map(toPublicPlaygroup),
    stats,
    recentGames: publicRecords.slice(0, 50),
    linkedGuests: linkedGuests.map(toPublicGuestProfile),
    claimableGuests,
  };
}

export function normalizeSavedDeckInput(input: {
  format?: string;
  deckName?: string;
  commanderName?: string;
  commanderScryfallId?: string;
  commanders?: CommanderSelection[];
  bracket?: number;
  poolId?: string;
  preferred?: boolean;
}): {
  format: string;
  deckName: string | null;
  commanderName: string | null;
  commanderScryfallId: string | null;
  commanders: CommanderSelection[];
  bracket: number | null;
  poolId: string;
  preferred: boolean;
} {
  const format = (input.format?.trim().toLowerCase() || 'commander').slice(
    0,
    32,
  );
  const deckName = input.deckName?.trim()
    ? input.deckName.trim().replace(/\s+/g, ' ').slice(0, 40)
    : null;

  let bracket: number | null = null;
  if (input.bracket !== undefined && input.bracket !== null) {
    if (
      !Number.isInteger(input.bracket) ||
      input.bracket < 1 ||
      input.bracket > 4
    ) {
      throw new InvalidEventInputError(
        'Bracket must be 1, 2, 3, or 4.',
      );
    }
    bracket = input.bracket;
  } else if (input.poolId) {
    bracket = bracketFromPoolId(input.poolId) ?? null;
  }

  const poolId = input.poolId?.trim().toLowerCase() || poolIdFromBracket(bracket ?? 3);
  if (!/^[a-z0-9][a-z0-9_-]{0,23}$/.test(poolId)) {
    throw new InvalidEventInputError('Invalid deck pool or bracket.');
  }

  let commanders: CommanderSelection[] = [];
  let commanderName = input.commanderName?.trim()
    ? input.commanderName.trim().replace(/\s+/g, ' ').slice(0, 200)
    : null;
  let commanderScryfallId = input.commanderScryfallId?.trim()
    ? input.commanderScryfallId.trim().slice(0, 100)
    : null;

  if (input.commanders && input.commanders.length > 0) {
    commanders = input.commanders.slice(0, 2).map((c) => ({
      oracleId: c.oracleId.trim(),
      cardId: c.cardId.trim(),
      name: c.name.trim(),
      artCropUri:
        c.artCropUri.trim() ||
        'https://cards.scryfall.io/art_crop/front/0/0/00000000-0000-0000-0000-000000000000.jpg',
      typeLine: c.typeLine.trim() || 'Legendary Creature',
      oracleText: c.oracleText ?? '',
      keywords: Array.isArray(c.keywords) ? c.keywords : [],
    }));
    commanderName = commanderName ?? commanders[0]!.name;
    commanderScryfallId =
      commanderScryfallId ??
      (commanders[0]!.oracleId || commanders[0]!.cardId);
  } else if (commanderName) {
    const fallback = buildFallbackCommanderSelection({
      commanderName,
      commanderScryfallId: commanderScryfallId ?? undefined,
    });
    commanders = [fallback];
    commanderScryfallId = commanderScryfallId ?? fallback.oracleId;
  }

  if (
    (format === 'commander' ||
      format === 'duel-commander' ||
      format === 'brawl') &&
    !commanderName &&
    !deckName
  ) {
    throw new InvalidEventInputError(
      'Provide a Commander name or deck name.',
    );
  }

  return {
    format,
    deckName,
    commanderName,
    commanderScryfallId,
    commanders,
    bracket: bracket ?? bracketFromPoolId(poolId) ?? null,
    poolId,
    preferred: input.preferred === true,
  };
}

export async function getJoinSuggestionsForEvent(
  store: EventStore,
  event: StoredEvent,
  query?: string,
): Promise<JoinGuestSuggestionsResponse> {
  if (!event.playgroupId || !event.showReturningPlayerSuggestions) {
    return { suggestions: [], totalCount: 0, mode: 'none' };
  }
  const activeGuests = await store.listGuestProfilesByPlaygroup(
    event.playgroupId,
  );
  const totalCount = activeGuests.length;
  if (totalCount === 0) {
    return { suggestions: [], totalCount: 0, mode: 'none' };
  }

  const trimmedQuery = query?.trim().toLowerCase() ?? '';
  if (trimmedQuery.length > 0) {
    const prefixMatches: StoredGuestProfile[] = [];
    const substringMatches: StoredGuestProfile[] = [];
    for (const guest of activeGuests) {
      const lower = guest.displayName.toLowerCase();
      if (lower.startsWith(trimmedQuery)) {
        prefixMatches.push(guest);
      } else if (lower.includes(trimmedQuery)) {
        substringMatches.push(guest);
      }
    }
    const combined = [...prefixMatches, ...substringMatches].slice(
      0,
      LARGE_PLAYGROUP_SEARCH_LIMIT,
    );
    return {
      suggestions: combined.map(toJoinGuestSuggestion),
      totalCount,
      mode: totalCount > SMALL_PLAYGROUP_SUGGESTION_LIMIT ? 'search' : 'list',
    };
  }

  if (totalCount <= SMALL_PLAYGROUP_SUGGESTION_LIMIT) {
    return {
      suggestions: activeGuests.map(toJoinGuestSuggestion),
      totalCount,
      mode: 'list',
    };
  }

  return {
    suggestions: activeGuests
      .slice(0, LARGE_PLAYGROUP_SEARCH_LIMIT)
      .map(toJoinGuestSuggestion),
    totalCount,
    mode: 'search',
  };
}

export async function getJoinGuestDecksForEvent(
  store: EventStore,
  event: StoredEvent,
  publicEvent: PublicEvent,
  guestProfileId: string,
): Promise<{
  guest: JoinGuestSuggestion;
  decks: JoinSavedDeckSuggestion[];
}> {
  if (!event.playgroupId || !event.showReturningPlayerSuggestions) {
    throw new GuestProfileNotFoundError();
  }
  const guest = await store.findGuestProfileById(guestProfileId);
  if (
    !guest ||
    guest.playgroupId !== event.playgroupId ||
    guest.archivedAt !== null
  ) {
    throw new GuestProfileNotFoundError();
  }
  const savedDecks = await store.listSavedDeckProfilesByGuest(guest.id);
  const compatible = savedDecks.filter((deck) =>
    isSavedDeckCompatibleWithEvent(toPublicSavedDeckProfile(deck), publicEvent),
  );
  return {
    guest: toJoinGuestSuggestion(guest),
    decks: compatible.map(toJoinSavedDeckSuggestion),
  };
}

export async function syncGuestDecksOnJoinOrUpdate(
  store: EventStore,
  input: {
    playgroupId: string;
    guestProfileId: string;
    event: StoredEvent;
    decks: Array<{
      name: string | null;
      poolId: string;
      preference: 'preferred' | 'accepted';
      commanders: CommanderSelection[];
    }>;
    explicitSavedDeckProfileId?: string;
    now: Date;
  },
): Promise<string | null> {
  const existingDecks = await store.listSavedDeckProfilesByGuest(
    input.guestProfileId,
  );
  const commanderRules = usesCommanderRules(
    input.event.gameMode,
    input.event.rulesFormat,
  );
  const format = commanderRules
    ? input.event.gameMode === 'duel-commander' ||
      input.event.gameMode === 'brawl'
      ? input.event.gameMode
      : 'commander'
    : 'normal';

  let primarySavedDeckId: string | null = null;

  for (const [index, deck] of input.decks.entries()) {
    const primaryCommander = deck.commanders[0];
    const commanderName = primaryCommander?.name ?? null;
    const scryfallId =
      primaryCommander?.oracleId || primaryCommander?.cardId || null;
    const bracket = bracketFromPoolId(deck.poolId) ?? null;

    let matched: StoredSavedDeckProfile | undefined;
    if (index === 0 && input.explicitSavedDeckProfileId) {
      matched = existingDecks.find(
        (d) => d.id === input.explicitSavedDeckProfileId,
      );
    }
    if (!matched && scryfallId && !scryfallId.startsWith('seeded-')) {
      matched = existingDecks.find(
        (d) =>
          d.commanderScryfallId?.toLowerCase() === scryfallId.toLowerCase() &&
          (d.bracket ?? bracketFromPoolId(d.poolId) ?? null) === bracket,
      );
    }
    if (!matched && commanderName) {
      matched = existingDecks.find(
        (d) =>
          d.commanderName?.toLowerCase() === commanderName.toLowerCase() &&
          (d.bracket ?? bracketFromPoolId(d.poolId) ?? null) === bracket,
      );
    }
    if (!matched && !commanderName && deck.name) {
      matched = existingDecks.find(
        (d) =>
          !d.commanderName &&
          d.deckName?.toLowerCase() === deck.name?.toLowerCase() &&
          d.poolId === deck.poolId,
      );
    }

    if (matched) {
      const updated = await store.updateSavedDeckProfile(matched.id, {
        timesUsed: matched.timesUsed + 1,
        lastUsedAt: input.now,
        ...(deck.commanders.length > 0 &&
        (matched.commanders.length === 0 ||
          matched.commanderScryfallId?.startsWith('seeded-'))
          ? {
              commanders: deck.commanders,
              commanderName: commanderName ?? matched.commanderName,
              commanderScryfallId: scryfallId ?? matched.commanderScryfallId,
            }
          : {}),
      });
      if (index === 0 || deck.preference === 'preferred') {
        primarySavedDeckId = updated.id;
      }
    } else if (commanderName || deck.name) {
      const created = await store.insertSavedDeckProfile({
        playgroupId: input.playgroupId,
        guestProfileId: input.guestProfileId,
        format,
        deckName: deck.name,
        commanderName,
        commanderScryfallId: scryfallId,
        commanders: deck.commanders,
        bracket,
        poolId: deck.poolId,
        preferred: existingDecks.length === 0 && index === 0,
        timesUsed: 1,
        lastUsedAt: input.now,
      });
      existingDecks.push(created);
      if (index === 0 || deck.preference === 'preferred') {
        primarySavedDeckId = created.id;
      }
    }
  }

  return primarySavedDeckId;
}

export async function recordPodCompletionToHistory(
  store: EventStore,
  input: {
    event: StoredEvent;
    podId: string;
    memberIds: string[];
    poolId?: string;
    winnerParticipantId?: string;
    durationSeconds?: number;
    startedAt?: Date | null;
    endedAt: Date;
    seatDecks?: Map<
      string,
      {
        deckName?: string;
        poolId?: string;
        commanders?: CommanderSelection[];
      }
    >;
  },
): Promise<StoredGameRecord> {
  const [people, allDecks] = await Promise.all([
    store.listParticipants(input.event.id),
    store.listDecks(input.event.id),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const decksByParticipant = new Map<string, StoredDeck[]>();
  for (const deck of allDecks) {
    const list = decksByParticipant.get(deck.participantId) ?? [];
    list.push(deck);
    decksByParticipant.set(deck.participantId, list);
  }

  const participants = input.memberIds.map((participantId) => {
    const person = personById.get(participantId);
    const seatDeck = input.seatDecks?.get(participantId);
    const pDecks = decksByParticipant.get(participantId) ?? [];
    const fallbackDeck =
      pDecks.find((d) => d.preference === 'preferred') ?? pDecks[0];

    const commanders =
      seatDeck?.commanders && seatDeck.commanders.length > 0
        ? seatDeck.commanders
        : (fallbackDeck?.commanders ?? []);
    const primaryCommander = commanders[0];
    const poolId =
      seatDeck?.poolId ?? fallbackDeck?.poolId ?? input.poolId ?? 'open';
    const bracket = bracketFromPoolId(poolId) ?? null;

    let resultType: GameResultType = 'COMPLETED_NO_WINNER';
    let placement: number | null = null;
    if (input.winnerParticipantId) {
      if (participantId === input.winnerParticipantId) {
        resultType = 'WIN';
        placement = 1;
      } else {
        resultType = 'LOSS';
      }
    }

    return {
      eventParticipantId: participantId,
      userAccountId: person?.userAccountId ?? null,
      guestProfileId: person?.guestProfileId ?? null,
      displayNameSnapshot: person?.displayName ?? 'Player',
      savedDeckProfileId: person?.savedDeckProfileId ?? null,
      deckNameSnapshot:
        seatDeck?.deckName ?? fallbackDeck?.name ?? null,
      commanderNameSnapshot: primaryCommander?.name ?? null,
      commanderScryfallIdSnapshot:
        primaryCommander?.oracleId || primaryCommander?.cardId || null,
      bracketSnapshot: bracket,
      resultType,
      placement,
      teamId: null,
    };
  });

  return store.upsertGameRecord({
    source: 'PODYGUARD',
    sourceType: 'EVENT_POD',
    sourceId: input.podId,
    eventId: input.event.id,
    playgroupId: input.event.playgroupId ?? null,
    gameMode: input.event.gameMode,
    format: input.event.rulesFormat,
    poolId: input.poolId ?? null,
    durationSeconds: input.durationSeconds ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt,
    participants,
  });
}

export async function recordRoundAssignmentToHistory(
  store: EventStore,
  input: {
    event: StoredEvent;
    roundNumber: number;
    assignmentId: string;
    activityKind: 'POD' | 'DUEL';
    participantIds: string[];
    outcome?: 'PLAYER_A_WIN' | 'PLAYER_B_WIN' | 'DRAW' | 'BYE';
    startedAt?: string;
    endedAt: Date;
  },
): Promise<StoredGameRecord | undefined> {
  if (input.participantIds.length === 0) {
    return undefined;
  }
  const [people, allDecks] = await Promise.all([
    store.listParticipants(input.event.id),
    store.listDecks(input.event.id),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const decksByParticipant = new Map<string, StoredDeck[]>();
  for (const deck of allDecks) {
    const list = decksByParticipant.get(deck.participantId) ?? [];
    list.push(deck);
    decksByParticipant.set(deck.participantId, list);
  }

  const sortedIds = [...input.participantIds].sort((a, b) =>
    a.localeCompare(b),
  );
  const playerAId = sortedIds[0];
  const playerBId = sortedIds[1];

  const participants = sortedIds.map((participantId) => {
    const person = personById.get(participantId);
    const pDecks = decksByParticipant.get(participantId) ?? [];
    const preferredDeck =
      pDecks.find((d) => d.preference === 'preferred') ?? pDecks[0];
    const primaryCommander = preferredDeck?.commanders[0];
    const bracket = bracketFromPoolId(preferredDeck?.poolId) ?? null;

    let resultType: GameResultType = 'COMPLETED_NO_WINNER';
    let placement: number | null = null;

    if (input.activityKind === 'DUEL' && input.outcome) {
      if (input.outcome === 'BYE') {
        resultType = 'BYE';
      } else if (input.outcome === 'DRAW') {
        resultType = 'DRAW';
      } else if (input.outcome === 'PLAYER_A_WIN') {
        resultType = participantId === playerAId ? 'WIN' : 'LOSS';
        placement = participantId === playerAId ? 1 : 2;
      } else if (input.outcome === 'PLAYER_B_WIN') {
        resultType = participantId === playerBId ? 'WIN' : 'LOSS';
        placement = participantId === playerBId ? 1 : 2;
      }
    }

    return {
      eventParticipantId: participantId,
      userAccountId: person?.userAccountId ?? null,
      guestProfileId: person?.guestProfileId ?? null,
      displayNameSnapshot: person?.displayName ?? 'Player',
      savedDeckProfileId: person?.savedDeckProfileId ?? null,
      deckNameSnapshot: preferredDeck?.name ?? null,
      commanderNameSnapshot: primaryCommander?.name ?? null,
      commanderScryfallIdSnapshot:
        primaryCommander?.oracleId || primaryCommander?.cardId || null,
      bracketSnapshot: bracket,
      resultType,
      placement,
      teamId: null,
    };
  });

  return store.upsertGameRecord({
    source: 'PODYGUARD',
    sourceType: 'ROUND_ASSIGNMENT',
    sourceId: `${input.event.id}:r${input.roundNumber}:${input.assignmentId}`,
    eventId: input.event.id,
    playgroupId: input.event.playgroupId ?? null,
    gameMode: input.event.gameMode,
    format: input.event.rulesFormat,
    poolId: null,
    durationSeconds: null,
    startedAt: input.startedAt ? new Date(input.startedAt) : null,
    endedAt: input.endedAt,
    participants,
  });
}

export async function recordLimitedMatchToHistory(
  store: EventStore,
  input: {
    event: StoredEvent;
    session: StoredLimitedSession;
    match: StoredLimitedMatch;
    endedAt: Date;
  },
): Promise<StoredGameRecord | undefined> {
  if (!input.match.outcome || input.match.outcome === 'BYE') {
    return undefined;
  }
  const people = await store.listParticipants(input.event.id);
  const personById = new Map(people.map((p) => [p.id, p]));
  const ids = [
    input.match.playerAId,
    ...(input.match.playerBId ? [input.match.playerBId] : []),
  ];

  const participants = ids.map((participantId) => {
    const person = personById.get(participantId);
    const isPlayerA = participantId === input.match.playerAId;
    let resultType: GameResultType = 'COMPLETED_NO_WINNER';
    let placement: number | null = null;
    if (input.match.outcome === 'PLAYER_A_WIN') {
      resultType = isPlayerA ? 'WIN' : 'LOSS';
      placement = isPlayerA ? 1 : 2;
    } else if (input.match.outcome === 'PLAYER_B_WIN') {
      resultType = !isPlayerA ? 'WIN' : 'LOSS';
      placement = !isPlayerA ? 1 : 2;
    } else if (input.match.outcome === 'DRAW') {
      resultType = 'DRAW';
    } else if (input.match.outcome === 'DOUBLE_LOSS') {
      resultType = 'LOSS';
    }
    return {
      eventParticipantId: participantId,
      userAccountId: person?.userAccountId ?? null,
      guestProfileId: person?.guestProfileId ?? null,
      displayNameSnapshot: person?.displayName ?? 'Player',
      savedDeckProfileId: null,
      deckNameSnapshot: null,
      commanderNameSnapshot: null,
      commanderScryfallIdSnapshot: null,
      bracketSnapshot: null,
      resultType,
      placement,
      teamId: null,
    };
  });

  return store.upsertGameRecord({
    source: 'PODYGUARD',
    sourceType: 'LIMITED_MATCH',
    sourceId: input.match.id,
    eventId: input.event.id,
    playgroupId: input.event.playgroupId ?? null,
    gameMode: input.session.mode,
    format: 'limited',
    poolId: null,
    durationSeconds: null,
    startedAt: input.session.startedAt,
    endedAt: input.endedAt,
    participants,
  });
}

export function toPublicUserAccount(row: StoredUserAccount): UserAccount {
  return {
    id: row.id,
    authUserId: row.authUserId,
    ...(row.email ? { email: row.email } : {}),
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicPlaygroup(row: StoredPlaygroup): Playgroup {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    guestIdentityVerification: row.guestIdentityVerification,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPublicGuestProfile(row: StoredGuestProfile): GuestProfile {
  return {
    id: row.id,
    playgroupId: row.playgroupId,
    displayName: row.displayName,
    ...(row.linkedUserAccountId
      ? { linkedUserAccountId: row.linkedUserAccountId }
      : {}),
    ...(row.archivedAt ? { archivedAt: row.archivedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt.toISOString() } : {}),
  };
}

export function toPublicSavedDeckProfile(
  row: StoredSavedDeckProfile,
): SavedDeckProfile {
  return {
    id: row.id,
    playgroupId: row.playgroupId,
    guestProfileId: row.guestProfileId,
    format: row.format,
    ...(row.deckName ? { deckName: row.deckName } : {}),
    ...(row.commanderName ? { commanderName: row.commanderName } : {}),
    ...(row.commanderScryfallId
      ? { commanderScryfallId: row.commanderScryfallId }
      : {}),
    commanders: row.commanders,
    ...(row.bracket !== null ? { bracket: row.bracket } : {}),
    poolId: row.poolId,
    preferred: row.preferred,
    timesUsed: row.timesUsed,
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    ...(row.archivedAt ? { archivedAt: row.archivedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toJoinGuestSuggestion(
  row: StoredGuestProfile,
): JoinGuestSuggestion {
  return {
    id: row.id,
    displayName: row.displayName,
  };
}

export function toJoinSavedDeckSuggestion(
  row: StoredSavedDeckProfile,
): JoinSavedDeckSuggestion {
  return {
    id: row.id,
    ...(row.deckName ? { deckName: row.deckName } : {}),
    ...(row.commanderName ? { commanderName: row.commanderName } : {}),
    ...(row.commanderScryfallId
      ? { commanderScryfallId: row.commanderScryfallId }
      : {}),
    commanders:
      row.commanders.length > 0
        ? row.commanders
        : row.commanderName
          ? [
              buildFallbackCommanderSelection({
                commanderName: row.commanderName,
                commanderScryfallId: row.commanderScryfallId ?? undefined,
              }),
            ]
          : [],
    ...(row.bracket !== null ? { bracket: row.bracket } : {}),
    poolId: row.poolId,
    format: row.format,
    preferred: row.preferred,
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
  };
}

export function toPublicGameRecord(row: StoredGameRecord): GameRecord {
  return {
    id: row.id,
    source: row.source,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    ...(row.eventId ? { eventId: row.eventId } : {}),
    ...(row.playgroupId ? { playgroupId: row.playgroupId } : {}),
    gameMode: row.gameMode,
    ...(row.format ? { format: row.format } : {}),
    ...(row.poolId ? { poolId: row.poolId } : {}),
    ...(row.durationSeconds !== null
      ? { durationSeconds: row.durationSeconds }
      : {}),
    ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
    endedAt: row.endedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    participants: row.participants.map((p) => ({
      id: p.id,
      gameRecordId: p.gameRecordId,
      ...(p.eventParticipantId
        ? { eventParticipantId: p.eventParticipantId }
        : {}),
      ...(p.userAccountId ? { userAccountId: p.userAccountId } : {}),
      ...(p.guestProfileId ? { guestProfileId: p.guestProfileId } : {}),
      displayNameSnapshot: p.displayNameSnapshot,
      ...(p.savedDeckProfileId
        ? { savedDeckProfileId: p.savedDeckProfileId }
        : {}),
      ...(p.deckNameSnapshot ? { deckNameSnapshot: p.deckNameSnapshot } : {}),
      ...(p.commanderNameSnapshot
        ? { commanderNameSnapshot: p.commanderNameSnapshot }
        : {}),
      ...(p.commanderScryfallIdSnapshot
        ? { commanderScryfallIdSnapshot: p.commanderScryfallIdSnapshot }
        : {}),
      ...(p.bracketSnapshot !== null
        ? { bracketSnapshot: p.bracketSnapshot }
        : {}),
      ...(p.resultType ? { resultType: p.resultType } : {}),
      ...(p.placement !== null ? { placement: p.placement } : {}),
      ...(p.teamId ? { teamId: p.teamId } : {}),
    })),
  };
}
