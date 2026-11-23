CREATE TABLE event_trackers (
 context text PRIMARY KEY,
 id uuid NOT NULL UNIQUE,
 game_id uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 read_token text NOT NULL,
 owner_id text NOT NULL,
 owner_name text NOT NULL,
 device_id text NOT NULL,
 generation integer NOT NULL CHECK (generation > 0),
 revision integer NOT NULL CHECK (revision >= 0),
 updated_at timestamptz NOT NULL,
 history jsonb NOT NULL,
 transfer jsonb
);
