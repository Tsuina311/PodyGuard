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
};

export type EventSnapshot = {
  event: PublicEvent;
  participants: PublicParticipant[];
  tables: PublicTable[];
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
  | 'limited_host_override';

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
