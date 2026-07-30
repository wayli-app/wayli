ALTER TABLE trip_entries ADD COLUMN IF NOT EXISTS cover_media_id uuid REFERENCES trip_media(id) ON DELETE SET NULL;
