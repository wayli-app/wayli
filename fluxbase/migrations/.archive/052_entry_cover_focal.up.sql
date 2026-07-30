ALTER TABLE trip_entries ADD COLUMN IF NOT EXISTS cover_focal_x real DEFAULT 0.5;
ALTER TABLE trip_entries ADD COLUMN IF NOT EXISTS cover_focal_y real DEFAULT 0.5;
