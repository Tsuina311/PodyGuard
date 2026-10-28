import type {
  ChallengePack,
  CommanderSelection,
  EventOperationMode,
  GameMode,
  GameResultType,
  GameSource,
  GameSourceType,
  GuestIdentityVerification,
  ProductEventName,
  PublicEvent,
  PublicParticipant,
  PublicPod,
  PublicTable,
  PublicChallengeCompletion,
  RoundEventState,
  RulesFormat,
  LimitedMatchOutcome,
  LimitedMatchStatus,
  LimitedEventModeConfig,
  LimitedMode,
  LimitedPairingPolicy,
  LimitedParticipantStatus,
  LimitedRound,
  LimitedSessionStatus,
  LimitedTimer,
  TablePreferenceKind,
  TournamentFormat,
  TournamentState,
  TreacheryRole,
} from '@podyguard/shared';

export class EventNotFoundError extends Error {
  readonly code = 'EVENT_NOT_FOUND';

  constructor() {
    super('Event not found.');
    this.name = 'EventNotFoundError';
  }
}

export class EventNotJoinableError extends Error {
  readonly code = 'EVENT_NOT_JOINABLE';

  constructor() {
    super('This event is not accepting new participants.');
    this.name = 'EventNotJoinableError';
  }
}

export class InvalidHostPinError extends Error {
  readonly code = 'INVALID_HOST_PIN';

  constructor() {
    super('Host PIN is incorrect.');
    this.name = 'InvalidHostPinError';
  }
}

export class JoinCodeConflictError extends Error {
  readonly code = 'JOIN_CODE_CONFLICT';

  constructor() {
    super('Join code already exists.');
    this.name = 'JoinCodeConflictError';
  }
}

export class InvalidParticipantTransitionError extends Error {
  readonly code = 'INVALID_PARTICIPANT_TRANSITION';

  constructor(message = 'That status change is not allowed.') {
    super(message);
    this.name = 'InvalidParticipantTransitionError';
  }
}

export class TableNotFoundError extends Error {
  readonly code = 'TABLE_NOT_FOUND';

  constructor() {
    super('Table not found.');
    this.name = 'TableNotFoundError';
  }
}

export class DevToolsDisabledError extends Error {
  readonly code = 'DEV_TOOLS_DISABLED';

  constructor() {
    super('Developer tools are only available in development.');
    this.name = 'DevToolsDisabledError';
  }
}

export class PodNotFoundError extends Error {
  readonly code = 'POD_NOT_FOUND';

  constructor() {
    super('No active pod is seated at that table.');
    this.name = 'PodNotFoundError';
  }
}

export class ParticipantNotFoundError extends Error {
  readonly code = 'PARTICIPANT_NOT_FOUND';

  constructor() {
    super('That player is not in this event.');
    this.name = 'ParticipantNotFoundError';
  }
}

export class PlaygroupNotFoundError extends Error {
  readonly code = 'PLAYGROUP_NOT_FOUND';

  constructor() {
    super('Playgroup not found.');
    this.name = 'PlaygroupNotFoundError';
  }
}

export class PlaygroupForbiddenError extends Error {
  readonly code = 'PLAYGROUP_FORBIDDEN';

  constructor() {
    super('You do not have permission to access this playgroup.');
    this.name = 'PlaygroupForbiddenError';
  }
}

export class GuestProfileNotFoundError extends Error {
  readonly code = 'GUEST_PROFILE_NOT_FOUND';

  constructor() {
    super('Saved player not found.');
    this.name = 'GuestProfileNotFoundError';
  }
}

export class DuplicateGuestNameError extends Error {
  readonly code = 'DUPLICATE_GUEST_NAME';

  constructor(displayName: string) {
    super(
      `A saved player named "${displayName}" already exists in this playgroup. Use a distinguisher or confirm adding a duplicate.`,
    );
    this.name = 'DuplicateGuestNameError';
  }
}

export class SavedDeckNotFoundError extends Error {
  readonly code = 'SAVED_DECK_NOT_FOUND';

  constructor() {
    super('Saved deck configuration not found.');
    this.name = 'SavedDeckNotFoundError';
  }
}

export type StoredUserAccount = {
  id: string;
  authUserId: string;
  email: string | null;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredAuthChallenge = {
  id: string;
  email: string;
  displayName: string | null;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type StoredPlaygroup = {
  id: string;
  ownerUserId: string;
  name: string;
  guestIdentityVerification: GuestIdentityVerification;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredGuestProfile = {
  id: string;
  playgroupId: string;
  displayName: string;
  linkedUserAccountId: string | null;
  archivedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredSavedDeckProfile = {
  id: string;
  playgroupId: string;
  guestProfileId: string;
  format: string;
  deckName: string | null;
  commanderName: string | null;
  commanderScryfallId: string | null;
  commanders: CommanderSelection[];
  bracket: number | null;
  poolId: string;
  preferred: boolean;
  timesUsed: number;
  lastUsedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewStoredSavedDeckProfile = {
  playgroupId: string;
  guestProfileId: string;
  format: string;
  deckName?: string | null;
  commanderName?: string | null;
  commanderScryfallId?: string | null;
  commanders?: CommanderSelection[];
  bracket?: number | null;
  poolId: string;
  preferred?: boolean;
  timesUsed?: number;
  lastUsedAt?: Date | null;
};

export type StoredGameRecordParticipant = {
  id: string;
  gameRecordId: string;
  eventParticipantId: string | null;
  userAccountId: string | null;
  guestProfileId: string | null;
  displayNameSnapshot: string;
  savedDeckProfileId: string | null;
  deckNameSnapshot: string | null;
  commanderNameSnapshot: string | null;
  commanderScryfallIdSnapshot: string | null;
  bracketSnapshot: number | null;
  resultType: GameResultType | null;
  placement: number | null;
  teamId: string | null;
  createdAt: Date;
};

export type StoredGameRecord = {
  id: string;
  source: GameSource;
  sourceType: GameSourceType;
  sourceId: string;
  eventId: string | null;
  playgroupId: string | null;
  gameMode: string;
  format: string | null;
  poolId: string | null;
  durationSeconds: number | null;
  startedAt: Date | null;
  endedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  participants: StoredGameRecordParticipant[];
};

export type UpsertStoredGameRecordInput = {
  source: GameSource;
  sourceType: GameSourceType;
  sourceId: string;
  eventId?: string | null;
  playgroupId?: string | null;
  gameMode: string;
  format?: string | null;
  poolId?: string | null;
  durationSeconds?: number | null;
  startedAt?: Date | null;
  endedAt: Date;
  participants: Array<{
    eventParticipantId?: string | null;
    userAccountId?: string | null;
    guestProfileId?: string | null;
    displayNameSnapshot: string;
    savedDeckProfileId?: string | null;
    deckNameSnapshot?: string | null;
    commanderNameSnapshot?: string | null;
    commanderScryfallIdSnapshot?: string | null;
    bracketSnapshot?: number | null;
    resultType?: GameResultType | null;
    placement?: number | null;
    teamId?: string | null;
  }>;
};

export type StoredEvent = {
  id: string;
  name: string;
  joinCode: string;
  status: PublicEvent['status'];
  gameMode: GameMode;
  rulesFormat: RulesFormat;
  hostCredentialHash: string;
  allowThreePods: boolean;
  allowFivePods: boolean;
  preferredPodSize: number;
  tournamentFormat: TournamentFormat | null;
  tournamentState: TournamentState | null;
  limitedModeConfigs: LimitedEventModeConfig[];
  operationMode: EventOperationMode;
  roundState: RoundEventState | null;
  expiresAt: Date;
  challengePackId: string;
  challengePackVersion: number;
  ownerUserId: string | null;
  playgroupId: string | null;
  showReturningPlayerSuggestions: boolean;
  guestIdentityVerification: GuestIdentityVerification;
  createdAt: Date;
};

export type StoredParticipant = {
  id: string;
  eventId: string;
  displayName: string;
  isBot: boolean;
  status: PublicParticipant['status'];
  readyAt: Date | null;
  limitedQueueMode: LimitedMode | null;
  limitedQueuedAt: Date | null;
  tablePreference: TablePreferenceKind;
  lockedTableId: string | null;
  preferredTableId: string | null;
  userAccountId: string | null;
  guestProfileId: string | null;
  savedDeckProfileId: string | null;
  flexCredits: number;
  createdAt: Date;
};

export type StoredAssignment = {
  podId: string;
  participantId: string;
  tableId: string;
  tableLabel: string;
  podStatus: 'formed' | 'playing';
  trackerUsed: boolean | null;
  poolId?: string;
  deckName?: string;
  commanders: CommanderSelection[];
  treacheryRole?: TreacheryRole;
  treacheryIdentityId?: number;
  treacheryUnveiledAt?: Date;
  podPlayingStartedAt?: Date | null;
  podCreatedAt?: Date;
};

export type StoredTreacheryAssignment = {
  podId: string;
  participantId: string;
  role: TreacheryRole;
  identityId: number;
  unveiledAt?: Date;
  podStatus: 'formed' | 'playing';
};

export type StoredDeck = {
  id: string;
  participantId: string;
  name: string | null;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export type StoredPod = PublicPod & {
  eventId: string;
  tableId: string;
  memberIds: string[];
  trackerUsed: boolean | null;
  tournamentMatchId?: string | null;
  winnerParticipantId?: string | null;
  durationSeconds?: number | null;
  completedAt?: Date | null;
  playingStartedAt?: Date | null;
  createdAt?: Date;
  rating?: number | null;
  seats?: StoredCompletedSeat[];
};

export type StoredCompletedSeat = {
  participantId: string;
  waitSeconds: number;
  assignedPoolId: string;
};

export type StoredCompletedGame = {
  id: string;
  eventId: string;
  poolId: string;
  memberIds: string[];
  trackerUsed: boolean | null;
  winnerParticipantId: string | null;
  durationSeconds: number | null;
  completedAt: Date | null;
  createdAt: Date;
  rating: number | null;
  seats: StoredCompletedSeat[];
};

export type CompletePodInput = {
  winnerParticipantId?: string;
  durationSeconds?: number;
  /** Tournament progression owns participant state after this game. */
  requeue?: boolean;
};

export type StoredChallengeCompletion = PublicChallengeCompletion & {
  id: string;
  eventId: string;
  scopeKey: string;
};

export type NewStoredChallengeCompletion = {
  eventId: string;
  participantId: string;
  podId: string;
  challengeId: string;
  scopeKey: string;
  points: number;
};

export type NewStoredDeck = {
  participantId: string;
  name: string | null;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export type StoredTable = {
  id: string;
  eventId: string;
  label: string;
  sortOrder: number;
  status: PublicTable['status'];
  zone?: string | null;
  createdAt: Date;
};

export type NewStoredEvent = {
  name: string;
  joinCode: string;
  hostCredentialHash: string;
  gameMode?: GameMode;
  rulesFormat?: RulesFormat;
  allowThreePods?: boolean;
  allowFivePods?: boolean;
  preferredPodSize?: number;
  tournamentFormat?: TournamentFormat;
  tournamentState?: TournamentState;
  limitedModeConfigs?: LimitedEventModeConfig[];
  operationMode?: EventOperationMode;
  roundState?: RoundEventState | null;
  ownerUserId?: string | null;
  playgroupId?: string | null;
  showReturningPlayerSuggestions?: boolean;
  guestIdentityVerification?: GuestIdentityVerification;
  expiresAt?: Date;
  createdAt?: Date;
};

export type NewStoredParticipant = {
  eventId: string;
  displayName: string;
  isBot?: boolean;
  status?: StoredParticipant['status'];
  readyAt?: Date | null;
  userAccountId?: string | null;
  guestProfileId?: string | null;
  savedDeckProfileId?: string | null;
};

export type NewStoredPod = {
  eventId: string;
  tableId: string;
  poolId: string;
  tournamentMatchId?: string;
  seats: Array<{
    participantId: string;
    deckId: string;
    assignedPoolId: string;
    treacheryRole?: TreacheryRole;
    treacheryIdentityId?: number;
  }>;
};

export type NewStoredTable = {
  eventId: string;
  label: string;
  sortOrder: number;
};

export type StoredLimitedParticipant = {
  participantId: string;
  displayName: string;
  status: LimitedParticipantStatus;
  draftSeat: number | null;
  seatedConfirmed: boolean;
  joinedAt: Date;
  assignedAt: Date | null;
  droppedAt: Date | null;
};

export type StoredLimitedMatch = {
  id: string;
  roundId: string;
  roundNumber: number;
  position: number;
  playerAId: string;
  playerBId: string | null;
  tableId: string | null;
  tableLabel: string | null;
  status: LimitedMatchStatus;
  bestOf: 1 | 3;
  outcome: LimitedMatchOutcome | null;
  playerAGameWins: number | null;
  playerBGameWins: number | null;
  reportedAt: Date | null;
};

export type StoredLimitedRound = {
  id: string;
  sessionId: string;
  number: number;
  status: LimitedRound['status'];
  matches: StoredLimitedMatch[];
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type StoredLimitedSession = {
  id: string;
  eventId: string;
  mode: LimitedMode;
  status: LimitedSessionStatus;
  label: string;
  participants: StoredLimitedParticipant[];
  rounds: StoredLimitedRound[];
  matchStructure: 'BO1' | 'BO3';
  pairingPolicy: LimitedPairingPolicy;
  preferredCohortSize: number | null;
  minCohortSize: number;
  maxCohortSize: number | null;
  allowUndersizedLaunch: boolean;
  currentRound: number | null;
  totalRounds: number;
  draftTableIds: string[];
  phaseAcks: string[];
  seatLayout: 'square' | 'long';
  timer: LimitedTimer | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type NewStoredLimitedSession = {
  eventId: string;
  mode: LimitedMode;
  label: string;
  matchStructure: 'BO1' | 'BO3';
  pairingPolicy: LimitedPairingPolicy;
  preferredCohortSize?: number;
  minCohortSize: number;
  maxCohortSize?: number;
  allowUndersizedLaunch?: boolean;
  totalRounds: number;
  participants: Array<{
    participantId: string;
    draftSeat?: number;
    status?: LimitedParticipantStatus;
    queuedAt?: Date;
  }>;
  draftTableIds?: string[];
  createdAt?: Date;
};

export type LimitedSessionPhasePatch = {
  status: LimitedSessionStatus;
  timer?: LimitedTimer | null;
  currentRound?: number | null;
  startedAt?: Date;
  completedAt?: Date | null;
};

export type NewStoredLimitedRound = {
  sessionId: string;
  number: number;
  status?: LimitedRound['status'];
  startedAt?: Date;
  matches: Array<{
    position: number;
    playerAId: string;
    playerBId?: string;
    tableId?: string;
    status?: LimitedMatchStatus;
    bestOf: 1 | 3;
    outcome?: LimitedMatchOutcome;
    playerAGameWins?: number;
    playerBGameWins?: number;
    reportedAt?: Date;
  }>;
};

export type LimitedRoundPatch = {
  status: LimitedRound['status'];
  startedAt?: Date;
  completedAt?: Date | null;
};

export type FinalizeLimitedMatchResultInput = {
  matchId: string;
  outcome: LimitedMatchOutcome;
  playerAGameWins: number;
  playerBGameWins: number;
  reportedAt?: Date;
  correctionReason?: string;
  correctedByParticipantId?: string;
};

export type StoredLimitedResultAudit = {
  id: string;
  matchId: string;
  previousOutcome: LimitedMatchOutcome | null;
  previousPlayerAGameWins: number | null;
  previousPlayerBGameWins: number | null;
  outcome: LimitedMatchOutcome;
  playerAGameWins: number;
  playerBGameWins: number;
  correctionReason: string | null;
  correctedByParticipantId: string | null;
  createdAt: Date;
};

export class LimitedPersistenceConflictError extends Error {
  readonly code = 'LIMITED_PERSISTENCE_CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'LimitedPersistenceConflictError';
  }
}

export type StoredTableReservation = {
  id: string;
  eventId: string;
  tableId: string;
  ownerType: string;
  ownerId: string;
  purpose: string;
  createdAt: Date;
};

export interface EventStore {
  insertEvent(input: NewStoredEvent): Promise<StoredEvent>;
  findEventByJoinCode(joinCode: string): Promise<StoredEvent | undefined>;
  findEventById(id: string): Promise<StoredEvent | undefined>;
  insertParticipant(input: NewStoredParticipant): Promise<StoredParticipant>;
  findParticipantById(id: string): Promise<StoredParticipant | undefined>;
  listParticipants(eventId: string): Promise<StoredParticipant[]>;
  updateParticipant(
    id: string,
    patch: {
      status: StoredParticipant['status'];
      readyAt: Date | null;
      flexCredits?: number;
      limitedQueueMode?: LimitedMode | null;
      limitedQueuedAt?: Date | null;
      tablePreference?: TablePreferenceKind;
      lockedTableId?: string | null;
      preferredTableId?: string | null;
      userAccountId?: string | null;
      guestProfileId?: string | null;
      savedDeckProfileId?: string | null;
    },
  ): Promise<StoredParticipant>;
  insertTable(input: NewStoredTable): Promise<StoredTable>;
  listTables(eventId: string): Promise<StoredTable[]>;
  findTableById(id: string): Promise<StoredTable | undefined>;
  updateTableStatus(
    id: string,
    status: StoredTable['status'],
  ): Promise<StoredTable>;
  createPod(input: NewStoredPod): Promise<StoredPod>;
  listAssignments(eventId: string): Promise<StoredAssignment[]>;
  findActiveTreacheryAssignment(
    eventId: string,
    participantId: string,
  ): Promise<StoredTreacheryAssignment | undefined>;
  unveilTreacheryIdentity(
    podId: string,
    participantId: string,
  ): Promise<StoredTreacheryAssignment>;
  listDecks(eventId: string): Promise<StoredDeck[]>;
  replaceDecks(
    participantId: string,
    decks: NewStoredDeck[],
  ): Promise<StoredDeck[]>;
  listMatchHistory(eventId: string): Promise<string[][]>;
  listChallengeCompletions(
    eventId: string,
  ): Promise<StoredChallengeCompletion[]>;
  insertChallengeCompletion(
    input: NewStoredChallengeCompletion,
  ): Promise<{ completion: StoredChallengeCompletion; created: boolean }>;
  findActivePodByTableId(
    eventId: string,
    tableId: string,
  ): Promise<StoredPod | undefined>;
  setPodTrackerUsed(podId: string, trackerUsed: boolean): Promise<StoredPod>;
  startPod(podId: string): Promise<StoredPod>;
  completePod(podId: string, result?: CompletePodInput): Promise<StoredPod>;
  cancelPod(podId: string): Promise<StoredPod>;
  listCompletedGames(eventId: string): Promise<StoredCompletedGame[]>;
  setPodRating(podId: string, rating: number): Promise<StoredCompletedGame>;
  findChallengePack(
    eventId: string,
    packId: string,
    version: number,
  ): Promise<ChallengePack | undefined>;
  insertChallengePackVersion(
    eventId: string,
    pack: ChallengePack,
  ): Promise<ChallengePack>;
  insertProductEvent(
    eventId: string,
    name: ProductEventName,
  ): Promise<void>;
  updateEvent(
    id: string,
    patch: {
      status?: StoredEvent['status'];
      allowThreePods?: boolean;
      allowFivePods?: boolean;
      preferredPodSize?: number;
      expiresAt?: Date;
      challengePackId?: string;
      challengePackVersion?: number;
      tournamentState?: TournamentState | null;
      operationMode?: EventOperationMode;
      roundState?: RoundEventState | null;
      playgroupId?: string | null;
      showReturningPlayerSuggestions?: boolean;
      guestIdentityVerification?: GuestIdentityVerification;
    },
  ): Promise<StoredEvent>;
  createLimitedSession(
    input: NewStoredLimitedSession,
  ): Promise<StoredLimitedSession>;
  findLimitedSessionById(
    id: string,
  ): Promise<StoredLimitedSession | undefined>;
  listLimitedSessions(eventId: string): Promise<StoredLimitedSession[]>;
  replaceLimitedSessionRoster(
    id: string,
    participants: Array<{ participantId: string; draftSeat?: number }>,
  ): Promise<StoredLimitedSession>;
  replaceLimitedDraftTables(
    id: string,
    tableIds: string[],
  ): Promise<StoredLimitedSession>;
  saveLimitedTableFlow(
    id: string,
    input: {
      seats?: Array<{
        participantId: string;
        draftSeat: number | null;
        seated: boolean;
      }>;
      phaseAcks?: string[];
      seatLayout?: 'square' | 'long';
    },
  ): Promise<StoredLimitedSession>;
  updateLimitedSessionPhase(
    id: string,
    patch: LimitedSessionPhasePatch,
  ): Promise<StoredLimitedSession>;
  createLimitedRound(
    input: NewStoredLimitedRound,
  ): Promise<StoredLimitedRound>;
  updateLimitedRound(
    id: string,
    patch: LimitedRoundPatch,
  ): Promise<StoredLimitedRound>;
  finalizeLimitedMatchResult(
    input: FinalizeLimitedMatchResultInput,
  ): Promise<{
    match: StoredLimitedMatch;
    audit: StoredLimitedResultAudit;
    corrected: boolean;
  }>;
  listLimitedResultAudits(
    eventId: string,
  ): Promise<StoredLimitedResultAudit[]>;
  dropLimitedParticipant(
    sessionId: string,
    participantId: string,
    droppedAt?: Date,
  ): Promise<StoredLimitedParticipant>;
  finishLimitedSession(
    id: string,
    status: 'COMPLETED' | 'CANCELLED',
    completedAt?: Date,
  ): Promise<StoredLimitedSession>;
  listActiveTableReservations(
    eventId: string,
  ): Promise<StoredTableReservation[]>;
  claimTable(input: {
    eventId: string;
    tableId: string;
    ownerType: string;
    ownerId: string;
    purpose: string;
  }): Promise<StoredTableReservation>;
  /** Release only if current active claim matches ownerType+ownerId. */
  releaseTableIfOwned(input: {
    tableId: string;
    ownerType: string;
    ownerId: string;
  }): Promise<boolean>;
  releaseAllOwnedTables(input: {
    eventId: string;
    ownerType: string;
    ownerId: string;
  }): Promise<string[]>;
  /** Release ROUND_ASSIGNMENT claims whose ownerId starts with `${roundId}:`. */
  releaseRoundAssignmentClaims(
    eventId: string,
    roundId: string,
  ): Promise<string[]>;

  upsertUserAccount(input: {
    authUserId: string;
    email?: string | null;
    displayName: string;
  }): Promise<StoredUserAccount>;
  findUserAccountById(id: string): Promise<StoredUserAccount | undefined>;
  findUserAccountByAuthUserId(
    authUserId: string,
  ): Promise<StoredUserAccount | undefined>;
  findUserAccountByEmail(email: string): Promise<StoredUserAccount | undefined>;
  updateUserAccount(
    id: string,
    patch: { displayName?: string },
  ): Promise<StoredUserAccount>;
  deleteUserAccount(id: string): Promise<void>;

  insertAuthChallenge(input: {
    email: string;
    displayName?: string | null;
    codeHash: string;
    expiresAt: Date;
  }): Promise<StoredAuthChallenge>;
  findLatestAuthChallengeByEmail(
    email: string,
  ): Promise<StoredAuthChallenge | undefined>;
  incrementAuthChallengeAttempts(id: string): Promise<void>;
  consumeAuthChallenge(id: string, consumedAt: Date): Promise<void>;

  insertPlaygroup(input: {
    ownerUserId: string;
    name: string;
    guestIdentityVerification?: GuestIdentityVerification;
  }): Promise<StoredPlaygroup>;
  findPlaygroupById(id: string): Promise<StoredPlaygroup | undefined>;
  listPlaygroupsByOwner(ownerUserId: string): Promise<StoredPlaygroup[]>;
  updatePlaygroup(
    id: string,
    patch: {
      name?: string;
      guestIdentityVerification?: GuestIdentityVerification;
    },
  ): Promise<StoredPlaygroup>;
  deletePlaygroup(id: string): Promise<void>;
  listEventsByPlaygroup(playgroupId: string): Promise<StoredEvent[]>;

  insertGuestProfile(input: {
    playgroupId: string;
    displayName: string;
    linkedUserAccountId?: string | null;
    lastSeenAt?: Date | null;
  }): Promise<StoredGuestProfile>;
  findGuestProfileById(id: string): Promise<StoredGuestProfile | undefined>;
  listGuestProfilesByPlaygroup(
    playgroupId: string,
    options?: { includeArchived?: boolean },
  ): Promise<StoredGuestProfile[]>;
  listGuestProfilesByLinkedUser(
    userAccountId: string,
  ): Promise<StoredGuestProfile[]>;
  updateGuestProfile(
    id: string,
    patch: {
      displayName?: string;
      linkedUserAccountId?: string | null;
      archivedAt?: Date | null;
      lastSeenAt?: Date | null;
    },
  ): Promise<StoredGuestProfile>;
  deleteGuestProfile(id: string): Promise<void>;
  mergeGuestProfiles(input: {
    playgroupId: string;
    sourceGuestId: string;
    targetGuestId: string;
  }): Promise<StoredGuestProfile>;

  insertSavedDeckProfile(
    input: NewStoredSavedDeckProfile,
  ): Promise<StoredSavedDeckProfile>;
  findSavedDeckProfileById(
    id: string,
  ): Promise<StoredSavedDeckProfile | undefined>;
  listSavedDeckProfilesByPlaygroup(
    playgroupId: string,
    options?: { includeArchived?: boolean },
  ): Promise<StoredSavedDeckProfile[]>;
  listSavedDeckProfilesByGuest(
    guestProfileId: string,
    options?: { includeArchived?: boolean },
  ): Promise<StoredSavedDeckProfile[]>;
  updateSavedDeckProfile(
    id: string,
    patch: Partial<
      Omit<NewStoredSavedDeckProfile, 'playgroupId' | 'guestProfileId'>
    > & {
      archivedAt?: Date | null;
      timesUsed?: number;
      lastUsedAt?: Date | null;
    },
  ): Promise<StoredSavedDeckProfile>;
  deleteSavedDeckProfile(id: string): Promise<void>;

  upsertGameRecord(
    input: UpsertStoredGameRecordInput,
  ): Promise<StoredGameRecord>;
  listGameRecordsByPlaygroup(playgroupId: string): Promise<StoredGameRecord[]>;
  listGameRecordsByEvent(eventId: string): Promise<StoredGameRecord[]>;
  listGameRecordsForIdentity(input: {
    guestProfileIds?: string[];
    userAccountIds?: string[];
  }): Promise<StoredGameRecord[]>;
}
