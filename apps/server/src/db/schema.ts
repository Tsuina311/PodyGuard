import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Enum values must stay aligned with @podin/shared.
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
  hostCredentialHash: text('host_credential_hash').notNull(),
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
