ALTER TABLE "deck_options" ADD COLUMN "commanders" jsonb DEFAULT '[]'::jsonb NOT NULL;
