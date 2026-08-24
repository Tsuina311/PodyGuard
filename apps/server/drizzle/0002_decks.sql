CREATE TABLE "deck_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"name" text,
	"pool_id" text NOT NULL,
	"preference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_history_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_history_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pods" ADD COLUMN "pool_id" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "pod_members" ADD COLUMN "assigned_pool_id" text;--> statement-breakpoint
ALTER TABLE "pod_members" ADD COLUMN "assigned_deck_id" uuid;--> statement-breakpoint
ALTER TABLE "pod_members" ADD COLUMN "assigned_deck_name" text;--> statement-breakpoint
ALTER TABLE "deck_options" ADD CONSTRAINT "deck_options_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history_members" ADD CONSTRAINT "match_history_members_match_history_id_match_history_id_fk" FOREIGN KEY ("match_history_id") REFERENCES "public"."match_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_history_members" ADD CONSTRAINT "match_history_members_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_members" ADD CONSTRAINT "pod_members_assigned_deck_id_deck_options_id_fk" FOREIGN KEY ("assigned_deck_id") REFERENCES "public"."deck_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX IF EXISTS "pod_members_participant_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "pod_members_pod_id_participant_id_unique" ON "pod_members" ("pod_id","participant_id");
