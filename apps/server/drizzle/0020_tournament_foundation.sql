ALTER TABLE "events" ADD COLUMN "tournament_format" text;
ALTER TABLE "events" ADD COLUMN "tournament_state" jsonb;
ALTER TABLE "pods" ADD COLUMN "tournament_match_id" text;
CREATE INDEX "pods_tournament_match_id_idx"
  ON "pods" USING btree ("tournament_match_id");
