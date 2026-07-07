-- 028: Trip media table (photos, eventually videos)
-- Stores metadata for user-uploaded media associated with trips and entries.

CREATE TABLE IF NOT EXISTS trip_media (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    entry_id        uuid REFERENCES trip_entries(id) ON DELETE SET NULL,
    user_id         uuid NOT NULL,
    storage_path    text NOT NULL,           -- e.g. {userId}/{tripId}/{filename}
    thumbnail_path  text,                    -- smaller variant path (null = same as storage_path)
    media_type      text NOT NULL DEFAULT 'image',  -- 'image' | 'video' (future)
    caption         text DEFAULT '',
    sort_order      int DEFAULT 0,
    width           int,
    height          int,
    taken_at        timestamptz,             -- from EXIF if available
    exif            jsonb,                   -- full EXIF data (GPS, camera, etc.)
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_trip_media_trip_id ON trip_media(trip_id);
CREATE INDEX idx_trip_media_user_id ON trip_media(user_id);
CREATE INDEX idx_trip_media_entry_id ON trip_media(entry_id);

COMMENT ON TABLE trip_media IS 'User-uploaded photos/videos for trips and journal entries.';

-- RLS: owner-scoped CRUD with cross-user prevention (same pattern as trip_entries)
ALTER TABLE trip_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_media_owner_select ON trip_media
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY trip_media_owner_insert ON trip_media
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM trips
            WHERE trips.id = trip_media.trip_id
            AND trips.user_id = auth.uid()
        )
    );

CREATE POLICY trip_media_owner_update ON trip_media
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY trip_media_owner_delete ON trip_media
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON trip_media TO authenticated;
