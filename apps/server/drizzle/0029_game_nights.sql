ALTER TABLE events ADD COLUMN game_night_id uuid CONSTRAINT events_game_night_id_unique UNIQUE;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN pregame_agreement jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE game_nights (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 playgroup_id uuid NOT NULL REFERENCES playgroups(id) ON DELETE CASCADE,
 name text NOT NULL,
 starts_at timestamptz NOT NULL,
 time_zone text NOT NULL,
 location text NOT NULL,
 seat_target integer NOT NULL CHECK (seat_target BETWEEN 2 AND 100),
 agreement jsonb NOT NULL DEFAULT '{}'::jsonb,
 cancelled boolean NOT NULL DEFAULT false,
 event_join_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX game_nights_playgroup_idx ON game_nights(playgroup_id);
--> statement-breakpoint
CREATE TABLE game_night_rsvps (
 night_id uuid NOT NULL REFERENCES game_nights(id) ON DELETE CASCADE,
 token_hash text NOT NULL,
 display_name text NOT NULL,
 response text NOT NULL CHECK (response IN ('yes', 'maybe', 'no'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX game_night_rsvp_unique ON game_night_rsvps(night_id, token_hash);
