import type {
  ChallengePack,
  CommanderSelection,
  GameMode,
  ProductEventName,
  PublicEvent,
  PublicParticipant,
  PublicPod,
  PublicTable,
  PublicChallengeCompletion,
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
  expiresAt: Date;
  challengePackId: string;
  challengePackVersion: number;
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
  expiresAt?: Date;
  createdAt?: Date;
};

export type NewStoredParticipant = {
  eventId: string;
  displayName: string;
  isBot?: boolean;
  status?: StoredParticipant['status'];
  readyAt?: Date | null;
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
}
