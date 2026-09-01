CREATE TYPE "public"."display_session_status" AS ENUM('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE "public"."display_mode" AS ENUM('FLOOR', 'QUEUES', 'LIMITED', 'AUTO');

CREATE TABLE "display_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid,
  "token_hash" text,
  "pairing_code_hash" text,
  "pairing_code_lookup" text,
  "pairing_expires_at" timestamp with time zone,
  "pairing_attempts" integer DEFAULT 0 NOT NULL,
  "status" "display_session_status" DEFAULT 'PENDING' NOT NULL,
  "label" text DEFAULT 'Display' NOT NULL,
  "mode" "display_mode" DEFAULT 'FLOOR' NOT NULL,
  "show_player_names" boolean DEFAULT true NOT NULL,
  "show_queues" boolean DEFAULT true NOT NULL,
  "show_timers" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);

CREATE TABLE "display_announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "cancelled_at" timestamp with time zone
);

ALTER TABLE "display_sessions" ADD CONSTRAINT "display_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "display_announcements" ADD CONSTRAINT "display_announcements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "display_sessions_event_id_idx" ON "display_sessions" USING btree ("event_id");
CREATE UNIQUE INDEX "display_sessions_token_hash_unique" ON "display_sessions" USING btree ("token_hash") WHERE "token_hash" IS NOT NULL;
CREATE UNIQUE INDEX "display_sessions_pairing_lookup_unique" ON "display_sessions" USING btree ("pairing_code_lookup") WHERE "pairing_code_lookup" IS NOT NULL;
CREATE INDEX "display_announcements_event_id_idx" ON "display_announcements" USING btree ("event_id");
