ALTER TABLE "limited_matches" ADD COLUMN "game_winners" jsonb;
--> statement-breakpoint
ALTER TABLE "limited_result_audits"
  ADD COLUMN "previous_game_winners" jsonb,
  ADD COLUMN "game_winners" jsonb;
