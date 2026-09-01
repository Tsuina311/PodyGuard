import type { GameMode } from './treachery';
import type { LimitedMode, LimitedSessionStatus, LimitedTimer } from './limited';
import type { PhysicalTableStatus } from './enums';

/** Host-chosen view for one paired public display. */
export const DISPLAY_MODES = ['FLOOR', 'QUEUES', 'LIMITED', 'AUTO'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export type DisplayConfig = {
  mode: DisplayMode;
  showPlayerNames: boolean;
  showQueues: boolean;
  showTimers: boolean;
};

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  mode: 'FLOOR',
  showPlayerNames: true,
  showQueues: true,
  showTimers: true,
};

export const DISPLAY_SESSION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'REVOKED',
] as const;
export type DisplaySessionStatus = (typeof DISPLAY_SESSION_STATUSES)[number];

/** Host-facing row — never includes the raw display token. */
export type HostDisplaySession = {
  id: string;
  label: string;
  status: DisplaySessionStatus;
  config: DisplayConfig;
  connected: boolean;
  lastSeenAt?: string;
  approvedAt?: string;
  createdAt: string;
};

export type PublicDisplayEventSummary = {
  id: string;
  name: string;
  joinCode: string;
  publicStatus: 'open' | 'locked' | 'closed';
  gameMode: GameMode;
};

export type PublicDisplayTableActivity =
  | 'FREE'
  | 'DISABLED'
  | 'RESERVED'
  | 'MATCH'
  | 'PLAYING'
  | 'LIMITED_DRAFT'
  | 'LIMITED_ROUND'
  | 'LIMITED_DECKBUILDING';

export type PublicDisplayTable = {
  id: string;
  label: string;
  sortOrder: number;
  status: PhysicalTableStatus;
  activity: PublicDisplayTableActivity;
  /** Format / queue label suitable for TV (e.g. Commander · B3). */
  activityLabel: string;
  playerNames: string[];
  playerCount: number;
  /** ISO timestamp when the current activity began, if known. */
  activityStartedAt?: string;
  /** Limited session label when this table is owned by Limited. */
  limitedSessionLabel?: string;
  limitedRound?: number;
  limitedResultsReported?: number;
  limitedResultsTotal?: number;
};

export type PublicDisplayQueue = {
  id: string;
  label: string;
  readyCount: number;
  /** Oldest ready/queued wait start, ISO. */
  oldestReadyAt?: string;
  /** Safe, player-facing hint — never scorer internals. */
  hint?: string;
  kind: 'casual' | 'limited';
  limitedMode?: LimitedMode;
  targetCount?: number;
};

export type PublicDisplayAssignment = {
  id: string;
  kind: 'match' | 'limited';
  title: string;
  subtitle?: string;
  tableLabel?: string;
  playerNames: string[];
  /** When the assignment was created (ISO). */
  assignedAt: string;
};

export type PublicDisplayLimitedMatch = {
  id: string;
  position: number;
  tableLabel?: string;
  playerAName: string;
  playerBName?: string;
  status: string;
  outcome?: string;
};

export type PublicDisplayLimitedSession = {
  id: string;
  label: string;
  mode: LimitedMode;
  status: LimitedSessionStatus;
  currentRound?: number;
  totalRounds: number;
  playerCount: number;
  timer?: LimitedTimer;
  matches: PublicDisplayLimitedMatch[];
  resultsReported: number;
  resultsTotal: number;
};

export type PublicDisplayAnnouncement = {
  id: string;
  message: string;
  /** ISO — announcement should show until this time. */
  endsAt: string;
  createdAt: string;
};

/**
 * Sanitized, allowlisted state for public TV / projector clients.
 * Built server-side — never a stripped host snapshot.
 */
export type PublicDisplayEventState = {
  serverNow: string;
  event: PublicDisplayEventSummary;
  config: DisplayConfig;
  tables: PublicDisplayTable[];
  queues: PublicDisplayQueue[];
  recentAssignments: PublicDisplayAssignment[];
  limitedSessions: PublicDisplayLimitedSession[];
  announcement: PublicDisplayAnnouncement | null;
};

/** How long a new table assignment stays prominent on the floor display. */
export const DISPLAY_ASSIGNMENT_HIGHLIGHT_MS = 12_000;

/** Default AUTO rotate dwell times (ms). */
export const DISPLAY_AUTO_ROTATE_MS = {
  FLOOR: 20_000,
  QUEUES: 10_000,
  LIMITED: 15_000,
} as const;
