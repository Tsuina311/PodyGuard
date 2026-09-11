-- ROUND_ASSIGNMENT claims use composite owner ids (`roundId:assignmentId`),
-- so owner_id must be text rather than uuid.
ALTER TABLE "table_reservations"
  ALTER COLUMN "owner_id" SET DATA TYPE text USING "owner_id"::text;
