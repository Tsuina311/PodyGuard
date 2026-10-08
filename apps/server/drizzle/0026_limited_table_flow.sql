ALTER TABLE "limited_sessions"
  ADD COLUMN "phase_acks" jsonb DEFAULT '[]'::jsonb NOT NULL;

ALTER TABLE "limited_session_participants"
  ADD COLUMN "seated_confirmed" boolean DEFAULT false NOT NULL;
