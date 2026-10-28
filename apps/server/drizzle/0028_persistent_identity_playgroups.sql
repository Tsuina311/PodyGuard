CREATE TABLE "user_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" text NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_accounts_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_accounts_email_unique" ON "user_accounts" USING btree ("email") WHERE "user_accounts"."email" is not null;
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_challenges_email_idx" ON "auth_challenges" USING btree ("email");
--> statement-breakpoint
CREATE TABLE "playgroups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"guest_identity_verification" text DEFAULT 'NONE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playgroups" ADD CONSTRAINT "playgroups_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "playgroups_owner_user_id_idx" ON "playgroups" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE TABLE "guest_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playgroup_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"linked_user_account_id" uuid,
	"archived_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_playgroup_id_playgroups_id_fk" FOREIGN KEY ("playgroup_id") REFERENCES "public"."playgroups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_linked_user_account_id_user_accounts_id_fk" FOREIGN KEY ("linked_user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "guest_profiles_playgroup_id_idx" ON "guest_profiles" USING btree ("playgroup_id");
--> statement-breakpoint
CREATE INDEX "guest_profiles_playgroup_name_idx" ON "guest_profiles" USING btree ("playgroup_id","display_name");
--> statement-breakpoint
CREATE INDEX "guest_profiles_linked_user_idx" ON "guest_profiles" USING btree ("linked_user_account_id");
--> statement-breakpoint
CREATE TABLE "saved_deck_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playgroup_id" uuid NOT NULL,
	"guest_profile_id" uuid NOT NULL,
	"format" text DEFAULT 'commander' NOT NULL,
	"deck_name" text,
	"commander_name" text,
	"commander_scryfall_id" text,
	"commanders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bracket" integer,
	"pool_id" text DEFAULT 'b3' NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_deck_profiles" ADD CONSTRAINT "saved_deck_profiles_playgroup_id_playgroups_id_fk" FOREIGN KEY ("playgroup_id") REFERENCES "public"."playgroups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saved_deck_profiles" ADD CONSTRAINT "saved_deck_profiles_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "saved_deck_profiles_playgroup_id_idx" ON "saved_deck_profiles" USING btree ("playgroup_id");
--> statement-breakpoint
CREATE INDEX "saved_deck_profiles_guest_profile_id_idx" ON "saved_deck_profiles" USING btree ("guest_profile_id");
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "owner_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "playgroup_id" uuid;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "show_returning_player_suggestions" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "guest_identity_verification" text DEFAULT 'NONE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_playgroup_id_playgroups_id_fk" FOREIGN KEY ("playgroup_id") REFERENCES "public"."playgroups"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "user_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "guest_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "saved_deck_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_saved_deck_profile_id_saved_deck_profiles_id_fk" FOREIGN KEY ("saved_deck_profile_id") REFERENCES "public"."saved_deck_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "game_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'PODYGUARD' NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"event_id" uuid,
	"playgroup_id" uuid,
	"game_mode" text NOT NULL,
	"format" text,
	"pool_id" text,
	"duration_seconds" integer,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_records" ADD CONSTRAINT "game_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_records" ADD CONSTRAINT "game_records_playgroup_id_playgroups_id_fk" FOREIGN KEY ("playgroup_id") REFERENCES "public"."playgroups"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "game_records_source_unique" ON "game_records" USING btree ("source","source_type","source_id");
--> statement-breakpoint
CREATE INDEX "game_records_event_id_idx" ON "game_records" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "game_records_playgroup_id_idx" ON "game_records" USING btree ("playgroup_id");
--> statement-breakpoint
CREATE TABLE "game_record_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_record_id" uuid NOT NULL,
	"event_participant_id" uuid,
	"user_account_id" uuid,
	"guest_profile_id" uuid,
	"display_name_snapshot" text NOT NULL,
	"saved_deck_profile_id" uuid,
	"deck_name_snapshot" text,
	"commander_name_snapshot" text,
	"commander_scryfall_id_snapshot" text,
	"bracket_snapshot" integer,
	"result_type" text,
	"placement" integer,
	"team_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_record_participants" ADD CONSTRAINT "game_record_participants_game_record_id_game_records_id_fk" FOREIGN KEY ("game_record_id") REFERENCES "public"."game_records"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_record_participants" ADD CONSTRAINT "game_record_participants_event_participant_id_participants_id_fk" FOREIGN KEY ("event_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_record_participants" ADD CONSTRAINT "game_record_participants_user_account_id_user_accounts_id_fk" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_record_participants" ADD CONSTRAINT "game_record_participants_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_record_participants" ADD CONSTRAINT "game_record_participants_saved_deck_profile_id_saved_deck_profiles_id_fk" FOREIGN KEY ("saved_deck_profile_id") REFERENCES "public"."saved_deck_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_record_participants_record_id_idx" ON "game_record_participants" USING btree ("game_record_id");
--> statement-breakpoint
CREATE INDEX "game_record_participants_user_id_idx" ON "game_record_participants" USING btree ("user_account_id");
--> statement-breakpoint
CREATE INDEX "game_record_participants_guest_id_idx" ON "game_record_participants" USING btree ("guest_profile_id");
--> statement-breakpoint
CREATE INDEX "game_record_participants_deck_id_idx" ON "game_record_participants" USING btree ("saved_deck_profile_id");
