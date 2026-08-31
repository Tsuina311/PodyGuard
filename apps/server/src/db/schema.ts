import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Enum values must stay aligned with @podyguard/shared.
 * Drizzle Kit loads this file via CJS, so we keep literal unions here
 * instead of importing the shared package.
 */
export const eventStatusEnum = pgEnum('event_status', [
  'open',
  'locked',
  'closed',
]);

export const participantStatusEnum = pgEnum('participant_status', [
  'joined',
  'ready',
  'matched',
  'playing',
  'paused',
  'left',
]);

export const physicalTableStatusEnum = pgEnum('physical_table_status', [
  'free',
  'occupied',
  'disabled',
]);

export const podStatusEnum = pgEnum('pod_status', [
  'formed',
  'playing',
  'completed',
  'cancelled',
]);

export const gameModeEnum = pgEnum('game_mode', [
  'duel',
  'multiplayer',
  'commander',
  'duel-commander',
  'brawl',
  'treachery',
  'two-headed-giant',
  'archenemy-commander',
  'emperor',
  'star',
  'assassin',
]);

export const rulesFormatEnum = pgEnum('rules_format', ['normal', 'commander']);

export const treacheryRoleEnum = pgEnum('treachery_role', [
  'leader',
  'guardian',
  'assassin',
  'traitor',
]);

export const limitedModeEnum = pgEnum('limited_mode', [
  'BOOSTER_DRAFT',
  'PICK_TWO_DRAFT',
  'SEALED',
]);

export const limitedSessionStatusEnum = pgEnum('limited_session_status', [
  'FORMING',
  'SEATING',
  'DRAFTING',
  'DECKBUILDING',
  'ROUND_ACTIVE',
  'BETWEEN_ROUNDS',
  'COMPLETED',
  'CANCELLED',
]);

export const limitedParticipantStatusEnum = pgEnum(
  'limited_participant_status',
  [
    'QUEUED',
    'ASSIGNED',
    'DRAFTING',
    'DECKBUILDING',
    'WAITING_FOR_ROUND',
    'PLAYING',
    'COMPLETED',
    'DROPPED',
  ],
);

export const limitedRoundStatusEnum = pgEnum('limited_round_status', [
  'PENDING',
  'ACTIVE',
  'COMPLETED',
]);

export const limitedMatchStatusEnum = pgEnum('limited_match_status', [
  'PENDING',
  'PLAYING',
  'COMPLETED',
]);

export const limitedMatchOutcomeEnum = pgEnum('limited_match_outcome', [
  'PLAYER_A_WIN',
  'PLAYER_B_WIN',
  'DRAW',
  'DOUBLE_LOSS',
  'BYE',
]);

export const limitedTimerPhaseEnum = pgEnum('limited_timer_phase', [
  'DRAFTING',
  'DECKBUILDING',
  'ROUND',
]);

export const limitedTimerStatusEnum = pgEnum('limited_timer_status', [
  'RUNNING',
  'PAUSED',
  'EXPIRED',
]);

/**
 * Minimal foundation tables for Phase 0 connectivity.
 * Domain tables expand in Phase 1+.
 */
export const schemaMeta = pgTable('schema_meta', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicJoinCode: text('public_join_code').notNull().unique(),
  name: text('name').notNull(),
  status: eventStatusEnum('status').notNull().default('open'),
  gameMode: gameModeEnum('game_mode').notNull().default('commander'),
  rulesFormat: rulesFormatEnum('rules_format').notNull().default('commander'),
  /** Event-local host PIN hash. Not a Neon Auth account. */
  hostCredentialHash: text('host_credential_hash').notNull(),
  allowThreePods: boolean('allow_three_pods').notNull().default(true),
  allowFivePods: boolean('allow_five_pods').notNull().default(false),
  preferredPodSize: integer('preferred_pod_size').notNull().default(4),
  /**
   * Null keeps the established drop-in/drop-out queue. Tournament state is a
   * versionable JSON document because each format owns a different tree shape;
   * pod rows still hold the durable game/result records.
   */
  tournamentFormat: text('tournament_format'),
  tournamentState: jsonb('tournament_state'),
  limitedModeConfigs: jsonb('limited_mode_configs')
    .$type<
      Array<{
        mode: 'BOOSTER_DRAFT' | 'PICK_TWO_DRAFT' | 'SEALED';
        enabled: boolean;
        matchStructure: 'BO1' | 'BO3';
        preferredCohortSize?: number;
        minCohortSize: number;
        maxCohortSize?: number;
        allowUndersizedLaunch: boolean;
        totalRounds: number | 'AUTO';
        draftMinutes?: number;
        deckbuildingMinutes: number;
        roundMinutes: number;
      }>
    >()
    .notNull()
    .default([]),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  challengePackId: text('challenge_pack_id')
    .notNull()
    .default('classic-commander-v1'),
  challengePackVersion: integer('challenge_pack_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const physicalTables = pgTable('physical_tables', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: physicalTableStatusEnum('status').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const participants = pgTable('participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  isBot: boolean('is_bot').notNull().default(false),
  status: participantStatusEnum('status').notNull().default('joined'),
  flexCredits: integer('flex_credits').notNull().default(0),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  limitedQueueMode: limitedModeEnum('limited_queue_mode'),
  limitedQueuedAt: timestamp('limited_queued_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const deckOptions = pgTable('deck_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
  name: text('name'),
  poolId: text('pool_id').notNull(),
  preference: text('preference').notNull(),
  commanders: jsonb('commanders')
    .$type<
      Array<{
        oracleId: string;
        cardId: string;
        name: string;
        artCropUri: string;
        typeLine: string;
        oracleText: string;
        keywords: string[];
      }>
    >()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const pods = pgTable(
  'pods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => physicalTables.id, { onDelete: 'restrict' }),
    poolId: text('pool_id').notNull().default('open'),
    status: podStatusEnum('status').notNull().default('formed'),
    trackerUsed: boolean('tracker_used'),
    tournamentMatchId: text('tournament_match_id'),
    winnerParticipantId: uuid('winner_participant_id').references(
      () => participants.id,
      { onDelete: 'set null' },
    ),
    durationSeconds: integer('duration_seconds'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rating: integer('rating'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('pods_tournament_match_id_idx').on(table.tournamentMatchId),
  ],
);

export const podMembers = pgTable(
  'pod_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    podId: uuid('pod_id')
      .notNull()
      .references(() => pods.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    assignedPoolId: text('assigned_pool_id'),
    assignedDeckId: uuid('assigned_deck_id').references(() => deckOptions.id, {
      onDelete: 'set null',
    }),
    assignedDeckName: text('assigned_deck_name'),
    treacheryRole: treacheryRoleEnum('treachery_role'),
    treacheryIdentityId: integer('treachery_identity_id'),
    treacheryUnveiledAt: timestamp('treachery_unveiled_at', {
      withTimezone: true,
    }),
    waitSeconds: integer('wait_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('pod_members_pod_id_participant_id_unique').on(
      table.podId,
      table.participantId,
    ),
  ],
);

export const matchHistory = pgTable('match_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const matchHistoryMembers = pgTable('match_history_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchHistoryId: uuid('match_history_id')
    .notNull()
    .references(() => matchHistory.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id, { onDelete: 'cascade' }),
});

export const challengeCompletions = pgTable(
  'challenge_completions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    podId: uuid('pod_id')
      .notNull()
      .references(() => pods.id, { onDelete: 'cascade' }),
    challengeId: text('challenge_id').notNull(),
    scopeKey: text('scope_key').notNull(),
    points: integer('points').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('challenge_completions_scope_unique').on(
      table.eventId,
      table.participantId,
      table.challengeId,
      table.scopeKey,
    ),
  ],
);

export const challengePackVersions = pgTable(
  'challenge_pack_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    packId: text('pack_id').notNull(),
    version: integer('version').notNull(),
    pack: jsonb('pack').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('challenge_pack_versions_event_pack_version_unique').on(
      table.eventId,
      table.packId,
      table.version,
    ),
  ],
);

export const productEvents = pgTable('product_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const limitedSessions = pgTable(
  'limited_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    mode: limitedModeEnum('mode').notNull(),
    status: limitedSessionStatusEnum('status').notNull().default('FORMING'),
    label: text('label').notNull(),
    matchStructure: text('match_structure').notNull(),
    pairingPolicy: text('pairing_policy').notNull(),
    preferredCohortSize: integer('preferred_cohort_size'),
    minCohortSize: integer('min_cohort_size').notNull(),
    maxCohortSize: integer('max_cohort_size'),
    allowUndersizedLaunch: boolean('allow_undersized_launch')
      .notNull()
      .default(false),
    currentRound: integer('current_round'),
    totalRounds: integer('total_rounds').notNull(),
    draftTableIds: jsonb('draft_table_ids')
      .$type<string[]>()
      .notNull()
      .default([]),
    timerPhase: limitedTimerPhaseEnum('timer_phase'),
    timerStatus: limitedTimerStatusEnum('timer_status'),
    timerDurationSeconds: integer('timer_duration_seconds'),
    timerStartedAt: timestamp('timer_started_at', { withTimezone: true }),
    timerTargetAt: timestamp('timer_target_at', { withTimezone: true }),
    timerPausedAt: timestamp('timer_paused_at', { withTimezone: true }),
    timerRemainingSecondsWhenPaused: integer(
      'timer_remaining_seconds_when_paused',
    ),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('limited_sessions_event_id_idx').on(table.eventId),
    check(
      'limited_sessions_cohort_sizes_check',
      sql`${table.minCohortSize} > 0
        and (${table.preferredCohortSize} is null or ${table.preferredCohortSize} >= ${table.minCohortSize})
        and (${table.maxCohortSize} is null or ${table.maxCohortSize} >= coalesce(${table.preferredCohortSize}, ${table.minCohortSize}))
        and ${table.totalRounds} > 0`,
    ),
  ],
);

export const limitedSessionParticipants = pgTable(
  'limited_session_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => limitedSessions.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    status: limitedParticipantStatusEnum('status')
      .notNull()
      .default('ASSIGNED'),
    draftSeat: integer('draft_seat'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    droppedAt: timestamp('dropped_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('limited_session_participants_membership_unique').on(
      table.sessionId,
      table.participantId,
    ),
    uniqueIndex('limited_session_participants_active_activity_unique')
      .on(table.participantId)
      .where(
        sql`${table.status} not in ('COMPLETED', 'DROPPED')`,
      ),
    uniqueIndex('limited_session_participants_seat_unique')
      .on(table.sessionId, table.draftSeat)
      .where(sql`${table.draftSeat} is not null`),
    check(
      'limited_session_participants_draft_seat_check',
      sql`${table.draftSeat} is null or ${table.draftSeat} > 0`,
    ),
  ],
);

export const draftSeats = pgTable(
  'draft_seats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => limitedSessions.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    seat: integer('seat').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('draft_seats_session_participant_unique').on(
      table.sessionId,
      table.participantId,
    ),
    uniqueIndex('draft_seats_session_seat_unique').on(
      table.sessionId,
      table.seat,
    ),
    check('draft_seats_seat_check', sql`${table.seat} > 0`),
  ],
);

export const limitedRounds = pgTable(
  'limited_rounds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => limitedSessions.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    status: limitedRoundStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('limited_rounds_session_number_unique').on(
      table.sessionId,
      table.number,
    ),
    check('limited_rounds_number_check', sql`${table.number} > 0`),
  ],
);

export const limitedMatches = pgTable(
  'limited_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => limitedRounds.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    status: limitedMatchStatusEnum('status').notNull().default('PENDING'),
    bestOf: integer('best_of').notNull(),
    outcome: limitedMatchOutcomeEnum('outcome'),
    playerAGameWins: integer('player_a_game_wins'),
    playerBGameWins: integer('player_b_game_wins'),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('limited_matches_round_position_unique').on(
      table.roundId,
      table.position,
    ),
    check('limited_matches_position_check', sql`${table.position} > 0`),
    check('limited_matches_best_of_check', sql`${table.bestOf} in (1, 3)`),
  ],
);

export const limitedMatchParticipants = pgTable(
  'limited_match_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => limitedRounds.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => limitedMatches.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'restrict' }),
    slot: text('slot').notNull(),
  },
  (table) => [
    uniqueIndex('limited_match_participants_round_participant_unique').on(
      table.roundId,
      table.participantId,
    ),
    uniqueIndex('limited_match_participants_match_slot_unique').on(
      table.matchId,
      table.slot,
    ),
    check('limited_match_participants_slot_check', sql`${table.slot} in ('A', 'B')`),
  ],
);

export const limitedResultAudits = pgTable('limited_result_audits', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id')
    .notNull()
    .references(() => limitedMatches.id, { onDelete: 'cascade' }),
  previousOutcome: limitedMatchOutcomeEnum('previous_outcome'),
  previousPlayerAGameWins: integer('previous_player_a_game_wins'),
  previousPlayerBGameWins: integer('previous_player_b_game_wins'),
  outcome: limitedMatchOutcomeEnum('outcome').notNull(),
  playerAGameWins: integer('player_a_game_wins').notNull(),
  playerBGameWins: integer('player_b_game_wins').notNull(),
  correctionReason: text('correction_reason'),
  correctedByParticipantId: uuid('corrected_by_participant_id').references(
    () => participants.id,
    { onDelete: 'set null' },
  ),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Generic ownership ledger for physical tables. Owner ids intentionally have
 * no FK because multiple resource kinds (Limited sessions, matches, and future
 * schedulers) can reserve a table. The partial unique index prevents two live
 * owners from claiming the same table without changing Commander table state.
 */
export const tableReservations = pgTable(
  'table_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => physicalTables.id, { onDelete: 'restrict' }),
    ownerType: text('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    purpose: text('purpose').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('table_reservations_active_table_unique')
      .on(table.tableId)
      .where(sql`${table.releasedAt} is null`),
    index('table_reservations_owner_idx').on(table.ownerType, table.ownerId),
  ],
);

