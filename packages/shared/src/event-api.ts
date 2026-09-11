import type {
  EventStatus,
  ParticipantStatus,
  PhysicalTableStatus,
} from './enums';
import type { ChallengePack, PublicChallengeCompletion } from './challenges';
import type { GameMode, PublicTreacheryIdentity } from './treachery';
import type { TournamentFormat, TournamentState } from './tournament';
import type {
  LimitedEventModeConfig,
  LimitedMode,
  LimitedQueueSummary,
  PublicLimitedSession,
} from './limited';
import type { EventOperationMode, RoundEventState } from './rounds';
import type { GameDurationHint } from './table-availability-hint';

export type { GameDurationHint } from './table-availability-hint';

export type PublicEvent = {
  id: string;
  name: string;
  joinCode: string;
  status: EventStatus;
  gameMode: GameMode;
  rulesFormat: 'normal' | 'commander';
  /** Compatibility flags describing whether the event mode permits these sizes. */
  allowThreePods: boolean;
  allowFivePods: boolean;
  /** Host-selected target. Queue policy may form other sizes legal for the mode. */
  preferredPodSize: number;
  /**
   * How the night runs: drop-in rolling queue (default) or synchronized rounds.
   * Orthogonal to game mode — Commander may be ROLLING or ROUNDS.
   * Omitted / unknown values should be treated as ROLLING.
   */
  operationMode?: EventOperationMode;
  /** Present when operationMode is ROUNDS (server snapshot). */
  rounds?: RoundEventState;
  /** Omitted for the normal drop-in/drop-out queue. */
  tournamentFormat?: TournamentFormat;
  /** Registration, rounds, and progression for tournament events. */
  tournament?: TournamentState;
  /** Independently enabled rolling Limited queues for this global event. */
  limitedModeConfigs?: LimitedEventModeConfig[];
  /** Total hours from creation until the join code dies. */
  lifetimeHours: number;
  expiresAt: string;
  challengePackId?: string;
  challengePackVersion?: number;
  challengePack?: ChallengePack;
};

export type CommanderSelection = {
  oracleId: string;
  cardId: string;
  name: string;
  artCropUri: string;
  typeLine: string;
  oracleText: string;
  keywords: string[];
};

export type PublicDeck = {
  id: string;
  name?: string;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export type PublicParticipant = {
  id: string;
  displayName: string;
  status: ParticipantStatus;
  isBot: boolean;
  tableLabel?: string;
  readyAt?: string;
  limitedQueueMode?: LimitedMode;
  limitedQueuedAt?: string;
  decks: PublicDeck[];
  assignedPoolId?: string;
  assignedDeckName?: string;
  assignedCommanders: CommanderSelection[];
  /** Present while seated once the pod has chosen whether to use the tracker. */
  trackerUsed?: boolean;
  flexCredits: number;
  challengePoints?: number;
  challengeCompletions?: PublicChallengeCompletion[];
  /** Public only after this player has chosen to unveil at the table. */
  revealedTreacheryIdentity?: PublicTreacheryIdentity;
};

export type PublicTable = {
  id: string;
  label: string;
  sortOrder: number;
  status: PhysicalTableStatus;
  seatedNames: string[];
  podStatus?: 'formed' | 'playing';
  trackerUsed?: boolean;
  poolId?: string;
  /** When the host started the game at this table, if known. */
  playingStartedAt?: string;
};

export type EventSnapshot = {
  event: PublicEvent;
  participants: PublicParticipant[];
  tables: PublicTable[];
  /** Typical finished-game length for advice-only availability hints. */
  gameDurationHint?: GameDurationHint;
  limitedQueues?: LimitedQueueSummary[];
  limitedSessions?: PublicLimitedSession[];
};

export type PublicPod = {
  id: string;
  tableLabel: string;
  playerNames: string[];
  status: 'formed' | 'playing' | 'completed' | 'cancelled';
  poolId?: string;
};

export type PodRating = 1 | 2 | 3 | 4;

export type ProductEventName =
  | 'joined_event'
  | 'became_ready'
  | 'match_found'
  | 'match_confirmed'
  | 'game_tracker_started'
  | 'game_tracker_skipped'
  | 'game_finished'
  | 'requeued'
  | 'paused'
  | 'left_event'
  | 'challenge_completed'
  | 'flex_concession_used'
  | 'identity_unveiled'
  | 'pod_rated'
  | 'limited_queued'
  | 'limited_session_created'
  | 'limited_phase_changed'
  | 'limited_round_created'
  | 'limited_result_reported'
  | 'limited_result_corrected'
  | 'limited_participant_dropped'
  | 'limited_session_completed'
  | 'limited_host_override'
  | 'round_generated'
  | 'round_published'
  | 'round_started'
  | 'round_completed'
  | 'round_repaired'
  | 'round_players_swapped'
  | 'round_result_reported'
  | 'round_result_corrected'
  | 'round_participant_dropped'
  | 'round_participant_marked_missing'
  | 'round_late_registered'
  | 'round_table_lock_set'
  | 'round_stale_basis_resolved';

export type EventMetrics = {
  participants: number;
  games: number;
  waitSeconds: { average: number; p95: number; max: number } | null;
  rematches: number;
  poolAssignments: Record<string, number>;
  flexEarned: number;
  flexCompensation: number;
  podSizes: Record<string, number>;
  tableUtilisation: { occupied: number; total: number; occupancyRate: number };
  gameDurationSeconds: { average: number; count: number } | null;
  gamesPerPlayer: number;
  trackerUsage: { used: number; skipped: number; unknown: number };
  challengeCompletions: number;
  challengePoints: number;
  podRating: { average: number; count: number } | null;
  limited: {
    sessions: number;
    completedSessions: number;
    cancelledSessions: number;
    droppedParticipants: number;
    undersizedLaunches: number;
    resultCorrections: number;
    averageCohortSize: number | null;
    queueWaitSeconds: { average: number; p95: number; max: number } | null;
    formationSeconds: { average: number; count: number } | null;
    roundDurationSeconds: { average: number; count: number } | null;
  };
};
