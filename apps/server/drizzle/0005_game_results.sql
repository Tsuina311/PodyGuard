ALTER TABLE "pods" ADD COLUMN "tracker_used" boolean;
ALTER TABLE "pods" ADD COLUMN "winner_participant_id" uuid;
ALTER TABLE "pods" ADD COLUMN "duration_seconds" integer;
ALTER TABLE "pods" ADD COLUMN "completed_at" timestamp with time zone;
ALTER TABLE "pods" ADD CONSTRAINT "pods_winner_participant_id_participants_id_fk" FOREIGN KEY ("winner_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
