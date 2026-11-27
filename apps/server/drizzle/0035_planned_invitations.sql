ALTER TABLE "game_nights" ADD COLUMN "event_setup" jsonb;
--> statement-breakpoint
ALTER TABLE "game_nights" ADD COLUMN "invitees" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "game_night_rsvps" ADD COLUMN "guest_profile_id" uuid;
