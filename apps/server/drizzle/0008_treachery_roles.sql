CREATE TYPE "public"."game_mode" AS ENUM('commander', 'treachery');
CREATE TYPE "public"."treachery_role" AS ENUM('leader', 'guardian', 'assassin', 'traitor');
ALTER TABLE "events" ADD COLUMN "game_mode" "game_mode" DEFAULT 'commander' NOT NULL;
ALTER TABLE "pod_members" ADD COLUMN "treachery_role" "treachery_role";
