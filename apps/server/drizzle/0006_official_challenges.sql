ALTER TABLE "events" ADD COLUMN "challenge_pack_id" text DEFAULT 'classic-commander-v1' NOT NULL;
ALTER TABLE "events" ADD COLUMN "challenge_pack_version" integer DEFAULT 1 NOT NULL;
CREATE TABLE "challenge_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "participant_id" uuid NOT NULL,
  "pod_id" uuid NOT NULL,
  "challenge_id" text NOT NULL,
  "scope_key" text NOT NULL,
  "points" integer NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "challenge_completions" ADD CONSTRAINT "challenge_completions_pod_id_pods_id_fk" FOREIGN KEY ("pod_id") REFERENCES "public"."pods"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "challenge_completions_scope_unique" ON "challenge_completions" USING btree ("event_id","participant_id","challenge_id","scope_key");
