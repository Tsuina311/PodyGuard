CREATE TYPE "public"."rules_format" AS ENUM('normal', 'commander');

ALTER TABLE "public"."events" ADD COLUMN "rules_format" "public"."rules_format" DEFAULT 'commander' NOT NULL;
