-- 029: Public sharing — RLS policies + grants + setting
-- Allows anon + authenticated to read trips (and their entries/media) WHERE visibility = 'public'.

-- ============================================================
-- 1. Grant SELECT to anon on the tables that support public reads
-- ============================================================
GRANT SELECT ON trips TO anon;
GRANT SELECT ON trip_entries TO anon;
GRANT SELECT ON trip_media TO anon;

-- ============================================================
-- 2. Public-read RLS policy on trips
--    (existing owner-scoped policies stay; this ADDS a new policy for anon)
-- ============================================================
CREATE POLICY trips_public_read ON trips
    FOR SELECT TO anon, authenticated
    USING (visibility = 'public');

-- ============================================================
-- 3. Cascading public-read on child tables
--    (only readable when the parent trip is public)
-- ============================================================
CREATE POLICY trip_entries_public_read ON trip_entries
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_entries.trip_id
        AND trips.visibility = 'public'
    ));

CREATE POLICY trip_media_public_read ON trip_media
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_media.trip_id
        AND trips.visibility = 'public'
    ));

-- ============================================================
-- 4. Public profile: allow anon to read user_profiles (for author display)
--    Limited to the columns needed for public display (username, full_name, avatar_url)
--    via a view, not a blanket SELECT on all columns.
-- ============================================================
CREATE OR REPLACE VIEW public_profiles AS
SELECT
    id,
    username,
    full_name,
    avatar_url,
    cover_photo_url,
    cover_focal_x,
    cover_focal_y
FROM user_profiles
WHERE username IS NOT NULL;

GRANT SELECT ON public_profiles TO anon, authenticated;

-- ============================================================
-- 5. Settings: public_trips_require_auth + landing_redirect_username
--    Use WHERE NOT EXISTS rather than ON CONFLICT (key): the unique
--    constraint on app.settings(key) is added by migration 008, but
--    app.settings is a Fluxbase-managed table and the constraint can be
--    dropped when Fluxbase recreates the table during upgrades.
-- ============================================================
INSERT INTO app.settings (key, value, is_public)
SELECT 'wayli.public_trips_require_auth', '{"value": false}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM app.settings WHERE key = 'wayli.public_trips_require_auth');

-- When set to a username, the landing page redirects to /u/{username}
-- (for single-user instances that want a personal travel blog feel).
INSERT INTO app.settings (key, value, is_public)
SELECT 'wayli.landing_redirect_username', '{"value": null}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM app.settings WHERE key = 'wayli.landing_redirect_username');
