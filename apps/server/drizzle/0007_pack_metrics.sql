ALTER TABLE "pods" ADD COLUMN "rating" integer;
ALTER TABLE "pod_members" ADD COLUMN "wait_seconds" integer;
CREATE TABLE "challenge_pack_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "pack_id" text NOT NULL,
  "version" integer NOT NULL,
  "pack" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "challenge_pack_versions" ADD CONSTRAINT "challenge_pack_versions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "challenge_pack_versions_event_pack_version_unique" ON "challenge_pack_versions" USING btree ("event_id","pack_id","version");
CREATE TABLE "product_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
