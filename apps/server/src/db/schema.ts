import {
  boolean,
  integer,
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
  'commander',
  'treachery',
  'two-headed-giant',
  'archenemy-commander',
  'emperor',
  'star',
  'assassin',
]);

export const treacheryRoleEnum = pgEnum('treachery_role', [
  'leader',
  'guardian',
  'assassin',
  'traitor',
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
  /** Event-local host PIN hash. Not a Neon Auth account. */
  hostCredentialHash: text('host_credential_hash').notNull(),
  allowThreePods: boolean('allow_three_pods').notNull().default(true),
  allowFivePods: boolean('allow_five_pods').notNull().default(false),
  preferredPodSize: integer('preferred_pod_size').notNull().default(4),
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

export const pods = pgTable('pods', {
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
});

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

