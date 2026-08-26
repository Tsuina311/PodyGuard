ALTER TABLE "events" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "events" SET "expires_at" = "created_at" + interval '24 hours' WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "expires_at" SET NOT NULL;
