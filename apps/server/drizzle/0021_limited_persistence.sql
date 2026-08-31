CREATE TYPE "public"."limited_mode" AS ENUM('BOOSTER_DRAFT', 'PICK_TWO_DRAFT', 'SEALED');
CREATE TYPE "public"."limited_session_status" AS ENUM('FORMING', 'SEATING', 'DRAFTING', 'DECKBUILDING', 'ROUND_ACTIVE', 'BETWEEN_ROUNDS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."limited_participant_status" AS ENUM('QUEUED', 'ASSIGNED', 'DRAFTING', 'DECKBUILDING', 'WAITING_FOR_ROUND', 'PLAYING', 'COMPLETED', 'DROPPED');
CREATE TYPE "public"."limited_round_status" AS ENUM('PENDING', 'ACTIVE', 'COMPLETED');
CREATE TYPE "public"."limited_match_status" AS ENUM('PENDING', 'PLAYING', 'COMPLETED');
CREATE TYPE "public"."limited_match_outcome" AS ENUM('PLAYER_A_WIN', 'PLAYER_B_WIN', 'DRAW', 'DOUBLE_LOSS', 'BYE');
CREATE TYPE "public"."limited_timer_phase" AS ENUM('DRAFTING', 'DECKBUILDING', 'ROUND');
CREATE TYPE "public"."limited_timer_status" AS ENUM('RUNNING', 'PAUSED', 'EXPIRED');

ALTER TABLE "events" ADD COLUMN "limited_mode_configs" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "participants" ADD COLUMN "limited_queue_mode" "limited_mode";
ALTER TABLE "participants" ADD COLUMN "limited_queued_at" timestamp with time zone;
ALTER TABLE "participants" ADD CONSTRAINT "participants_limited_queue_consistency_check"
  CHECK (("limited_queue_mode" IS NULL) = ("limited_queued_at" IS NULL));

CREATE TABLE "limited_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "mode" "limited_mode" NOT NULL,
  "status" "limited_session_status" DEFAULT 'FORMING' NOT NULL,
  "label" text NOT NULL,
  "match_structure" text NOT NULL,
  "pairing_policy" text NOT NULL,
  "preferred_cohort_size" integer,
  "min_cohort_size" integer NOT NULL,
  "max_cohort_size" integer,
  "allow_undersized_launch" boolean DEFAULT false NOT NULL,
  "current_round" integer,
  "total_rounds" integer NOT NULL,
  "draft_table_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timer_phase" "limited_timer_phase",
  "timer_status" "limited_timer_status",
  "timer_duration_seconds" integer,
  "timer_started_at" timestamp with time zone,
  "timer_target_at" timestamp with time zone,
  "timer_paused_at" timestamp with time zone,
  "timer_remaining_seconds_when_paused" integer,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "limited_sessions_cohort_sizes_check" CHECK (
    "min_cohort_size" > 0
    AND ("preferred_cohort_size" IS NULL OR "preferred_cohort_size" >= "min_cohort_size")
    AND ("max_cohort_size" IS NULL OR "max_cohort_size" >= coalesce("preferred_cohort_size", "min_cohort_size"))
    AND "total_rounds" > 0
  )
);

CREATE TABLE "limited_session_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "status" "limited_participant_status" DEFAULT 'ASSIGNED' NOT NULL,
  "draft_seat" integer,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assigned_at" timestamp with time zone,
  "dropped_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "limited_session_participants_draft_seat_check" CHECK ("draft_seat" IS NULL OR "draft_seat" > 0)
);

CREATE TABLE "draft_seats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "seat" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "draft_seats_seat_check" CHECK ("seat" > 0)
);

CREATE TABLE "limited_rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "number" integer NOT NULL,
  "status" "limited_round_status" DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  CONSTRAINT "limited_rounds_number_check" CHECK ("number" > 0)
);

CREATE TABLE "limited_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "status" "limited_match_status" DEFAULT 'PENDING' NOT NULL,
  "best_of" integer NOT NULL,
  "outcome" "limited_match_outcome",
  "player_a_game_wins" integer,
  "player_b_game_wins" integer,
  "reported_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "limited_matches_position_check" CHECK ("position" > 0),
  CONSTRAINT "limited_matches_best_of_check" CHECK ("best_of" IN (1, 3))
);

CREATE TABLE "limited_match_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid NOT NULL,
  "match_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "slot" text NOT NULL,
  CONSTRAINT "limited_match_participants_slot_check" CHECK ("slot" IN ('A', 'B'))
);

CREATE TABLE "limited_result_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL,
  "previous_outcome" "limited_match_outcome",
  "previous_player_a_game_wins" integer,
  "previous_player_b_game_wins" integer,
  "outcome" "limited_match_outcome" NOT NULL,
  "player_a_game_wins" integer NOT NULL,
  "player_b_game_wins" integer NOT NULL,
  "correction_reason" text,
  "corrected_by_participant_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "table_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "table_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone
);

ALTER TABLE "limited_sessions" ADD CONSTRAINT "limited_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_session_participants" ADD CONSTRAINT "limited_session_participants_session_id_limited_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."limited_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_session_participants" ADD CONSTRAINT "limited_session_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "draft_seats" ADD CONSTRAINT "draft_seats_session_id_limited_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."limited_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "draft_seats" ADD CONSTRAINT "draft_seats_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "limited_rounds" ADD CONSTRAINT "limited_rounds_session_id_limited_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."limited_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_matches" ADD CONSTRAINT "limited_matches_round_id_limited_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."limited_rounds"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_match_participants" ADD CONSTRAINT "limited_match_participants_round_id_limited_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."limited_rounds"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_match_participants" ADD CONSTRAINT "limited_match_participants_match_id_limited_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."limited_matches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_match_participants" ADD CONSTRAINT "limited_match_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "limited_result_audits" ADD CONSTRAINT "limited_result_audits_match_id_limited_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."limited_matches"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "limited_result_audits" ADD CONSTRAINT "limited_result_audits_corrected_by_participant_id_participants_id_fk" FOREIGN KEY ("corrected_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_table_id_physical_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."physical_tables"("id") ON DELETE restrict ON UPDATE no action;

CREATE INDEX "limited_sessions_event_id_idx" ON "limited_sessions" USING btree ("event_id");
CREATE UNIQUE INDEX "limited_session_participants_membership_unique" ON "limited_session_participants" USING btree ("session_id", "participant_id");
CREATE UNIQUE INDEX "limited_session_participants_active_activity_unique"
  ON "limited_session_participants" USING btree ("participant_id")
  WHERE "status" NOT IN ('COMPLETED', 'DROPPED');
CREATE UNIQUE INDEX "draft_seats_session_participant_unique" ON "draft_seats" USING btree ("session_id", "participant_id");
CREATE UNIQUE INDEX "draft_seats_session_seat_unique" ON "draft_seats" USING btree ("session_id", "seat");
CREATE UNIQUE INDEX "limited_session_participants_seat_unique" ON "limited_session_participants" USING btree ("session_id", "draft_seat") WHERE "draft_seat" IS NOT NULL;
CREATE UNIQUE INDEX "limited_rounds_session_number_unique" ON "limited_rounds" USING btree ("session_id", "number");
CREATE UNIQUE INDEX "limited_matches_round_position_unique" ON "limited_matches" USING btree ("round_id", "position");
CREATE UNIQUE INDEX "limited_match_participants_round_participant_unique" ON "limited_match_participants" USING btree ("round_id", "participant_id");
CREATE UNIQUE INDEX "limited_match_participants_match_slot_unique" ON "limited_match_participants" USING btree ("match_id", "slot");
CREATE UNIQUE INDEX "table_reservations_active_table_unique" ON "table_reservations" USING btree ("table_id") WHERE "released_at" IS NULL;
CREATE INDEX "table_reservations_owner_idx" ON "table_reservations" USING btree ("owner_type", "owner_id");
