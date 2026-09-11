-- Synchronous round / tournament operation mode (orthogonal to game_mode).
ALTER TABLE "events" ADD COLUMN "operation_mode" text NOT NULL DEFAULT 'ROLLING';
ALTER TABLE "events" ADD COLUMN "round_state" jsonb;

-- Lightweight table zoning + accessibility preference metadata.
ALTER TABLE "physical_tables" ADD COLUMN "zone" text;
ALTER TABLE "participants" ADD COLUMN "table_preference" text NOT NULL DEFAULT 'none';
ALTER TABLE "participants" ADD COLUMN "locked_table_id" uuid
  REFERENCES "physical_tables"("id") ON DELETE SET NULL;
ALTER TABLE "participants" ADD COLUMN "preferred_table_id" uuid
  REFERENCES "physical_tables"("id") ON DELETE SET NULL;

CREATE INDEX "participants_locked_table_id_idx"
  ON "participants" USING btree ("locked_table_id");
