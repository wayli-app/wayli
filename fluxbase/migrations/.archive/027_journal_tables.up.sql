-- 027: Journal tables — trip entries, visibility, username
-- Adds the data model for Polarsteps-style travel journals.

-- ============================================================
-- 1. Trip journal entries (dated markdown posts within a trip)
-- ============================================================
CREATE TABLE IF NOT EXISTS trip_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    title       text NOT NULL DEFAULT '',
    body        text NOT NULL DEFAULT '',      -- markdown source
    entry_date  date NOT NULL,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_trip_entries_trip_id ON trip_entries(trip_id);
CREATE INDEX idx_trip_entries_user_id ON trip_entries(user_id);
CREATE INDEX idx_trip_entries_entry_date ON trip_entries(entry_date);

COMMENT ON TABLE trip_entries IS 'Dated markdown journal entries within a trip (Polarsteps-style).';

-- ============================================================
-- 2. Visibility on trips (for Phase 3 public sharing)
-- ============================================================
ALTER TABLE trips ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'private'
    CHECK (visibility IN ('private', 'public', 'unlisted'));

COMMENT ON COLUMN trips.visibility IS 'private (default), public (anyone can view), or unlisted (owner only).';

-- ============================================================
-- 3. Username on user_profiles (for /u/[username] URLs)
-- ============================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;

COMMENT ON COLUMN user_profiles.username IS 'Unique URL-safe username for public profile pages (/u/username).';

-- ============================================================
-- 4. my_trips view: visibility will be appended in Phase 3
--    (CREATE OR REPLACE VIEW can only append columns at the end,
--     not insert them mid-list. The detail page queries trips
--     directly, so the view update is deferred.)
-- ============================================================

-- ============================================================
-- 5. RLS on trip_entries — owner-scoped with cross-user prevention
-- ============================================================
ALTER TABLE trip_entries ENABLE ROW LEVEL SECURITY;

-- Owner can read their own entries
CREATE POLICY trip_entries_owner_select ON trip_entries
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Owner can insert entries — WITH CHECK prevents cross-user entries
-- (verifies the parent trip also belongs to the user)
CREATE POLICY trip_entries_owner_insert ON trip_entries
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM trips
            WHERE trips.id = trip_entries.trip_id
            AND trips.user_id = auth.uid()
        )
    );

-- Owner can update their own entries
CREATE POLICY trip_entries_owner_update ON trip_entries
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Owner can delete their own entries
CREATE POLICY trip_entries_owner_delete ON trip_entries
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Grant access to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_entries TO authenticated;
