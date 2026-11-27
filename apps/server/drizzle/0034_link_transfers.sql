CREATE TABLE "link_transfers" (
  "id" uuid PRIMARY KEY,
  "send_token_hash" text NOT NULL,
  "receive_token_hash" text NOT NULL,
  "destination" text,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "link_transfers_expiry_idx" ON "link_transfers" ("expires_at");
