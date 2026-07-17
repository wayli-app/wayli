-- Granular Trip Sharing + Visibility System
-- Replaces simple private/public with per-trip friend sharing + configurable costs/GPS/comments

-- ═══ Part 1: Convert 'unlisted' → 'private' ═══
UPDATE trips SET visibility = 'private' WHERE visibility = 'unlisted';

-- Update CHECK constraint (remove 'unlisted')
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'trips_visibility_check') THEN
        ALTER TABLE trips DROP CONSTRAINT trips_visibility_check;
    END IF;
END $$;
ALTER TABLE trips ADD CONSTRAINT trips_visibility_check
    CHECK (visibility IN ('private', 'public'));

-- ═══ Part 2: Per-trip permission columns ═══
ALTER TABLE trips ADD COLUMN IF NOT EXISTS costs_visible_to text DEFAULT 'private'
    CHECK (costs_visible_to IN ('private', 'friends', 'public'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS gps_visible_to text DEFAULT 'private'
    CHECK (gps_visible_to IN ('private', 'friends', 'public'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS comments_allowed text DEFAULT 'friends'
    CHECK (comments_allowed IN ('owner', 'friends', 'public'));

-- ═══ Part 3: Friend connections (bidirectional request/accept) ═══
CREATE TABLE IF NOT EXISTS user_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    friend_id UUID NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, friend_id)
);
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

-- ═══ Part 4: Per-trip shares ═══
CREATE TABLE IF NOT EXISTS trip_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    shared_with_user_id UUID NOT NULL,
    role text DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(trip_id, shared_with_user_id)
);
ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;

-- ═══ Part 5: Pre-computed GPS tracks (for friends/public viewing) ═══
CREATE TABLE IF NOT EXISTS trip_gps_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    points jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE trip_gps_tracks ENABLE ROW LEVEL SECURITY;

-- ═══ Part 6: SECURITY DEFINER functions (avoid RLS recursion) ═══

-- Can this user see this trip?
CREATE OR REPLACE FUNCTION public.can_see_trip(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR visibility = 'public'
            OR EXISTS(
                SELECT 1 FROM trip_shares
                WHERE trip_id = trip_uuid
                AND shared_with_user_id = auth.uid()
            )
        )
    ) OR EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND visibility = 'public'
    );
$$;

-- Can this user see costs for this trip?
CREATE OR REPLACE FUNCTION public.can_see_costs(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR (costs_visible_to = 'public' AND visibility = 'public')
            OR (costs_visible_to IN ('friends', 'public')
                AND auth.uid() IS NOT NULL
                AND EXISTS(
                    SELECT 1 FROM trip_shares
                    WHERE trip_id = trip_uuid
                    AND shared_with_user_id = auth.uid()
                ))
        )
    );
$$;

-- Can this user see GPS track for this trip?
CREATE OR REPLACE FUNCTION public.can_see_gps(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR (gps_visible_to = 'public' AND visibility = 'public')
            OR (gps_visible_to IN ('friends', 'public')
                AND auth.uid() IS NOT NULL
                AND EXISTS(
                    SELECT 1 FROM trip_shares
                    WHERE trip_id = trip_uuid
                    AND shared_with_user_id = auth.uid()
                ))
        )
    );
$$;

-- Can this user comment on entries in this trip?
CREATE OR REPLACE FUNCTION public.can_comment(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR comments_allowed = 'public'
            OR (comments_allowed IN ('friends', 'public')
                AND EXISTS(
                    SELECT 1 FROM trip_shares
                    WHERE trip_id = trip_uuid
                    AND shared_with_user_id = auth.uid()
                ))
        )
    );
$$;

-- ═══ Part 7: Cost-masking view ═══
CREATE OR REPLACE VIEW visible_plan_items AS
SELECT
    tpi.id, tpi.trip_id, tpi.user_id, tpi.day_number, tpi.sort_order,
    tpi.title, tpi.description, tpi.type, tpi.start_time, tpi.end_time,
    tpi.location_lat, tpi.location_lng, tpi.address,
    tpi.booking_url, tpi.booking_status, tpi.want_to_visit_id,
    tpi.notes, tpi.created_by, tpi.created_at, tpi.updated_at,
    CASE WHEN can_see_costs(tpi.trip_id)
         THEN tpi.cost_estimate ELSE NULL END AS cost_estimate,
    CASE WHEN can_see_costs(tpi.trip_id)
         THEN tpi.currency ELSE NULL END AS currency
FROM trip_plan_items tpi
WHERE can_see_trip(tpi.trip_id);

-- ═══ Part 8: RLS Policies ═══

-- user_connections: bidirectional access
DROP POLICY IF EXISTS user_connections_select ON user_connections
    FOR SELECT USING (user_id = auth.uid() OR friend_id = auth.uid());
DROP POLICY IF EXISTS user_connections_insert ON user_connections
    FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_connections_update ON user_connections
    FOR UPDATE USING (friend_id = auth.uid());
DROP POLICY IF EXISTS user_connections_delete ON user_connections
    FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- trip_shares: owner manages, friend can see they're shared
DROP POLICY IF EXISTS trip_shares_select ON trip_shares
    FOR SELECT USING (
        shared_with_user_id = auth.uid()
        OR EXISTS(SELECT 1 FROM trips WHERE id = trip_shares.trip_id AND user_id = auth.uid())
    );
DROP POLICY IF EXISTS trip_shares_insert ON trip_shares
    FOR INSERT WITH CHECK (
        EXISTS(SELECT 1 FROM trips WHERE id = trip_shares.trip_id AND user_id = auth.uid())
    );
DROP POLICY IF EXISTS trip_shares_delete ON trip_shares
    FOR DELETE USING (
        EXISTS(SELECT 1 FROM trips WHERE id = trip_shares.trip_id AND user_id = auth.uid())
    );

-- trip_gps_tracks: owner + can_see_gps
DROP POLICY IF EXISTS trip_gps_tracks_select ON trip_gps_tracks
    FOR SELECT USING (
        user_id = auth.uid() OR can_see_gps(trip_id)
    );
DROP POLICY IF EXISTS trip_gps_tracks_insert ON trip_gps_tracks
    FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS trip_gps_tracks_delete ON trip_gps_tracks
    FOR DELETE USING (user_id = auth.uid());

-- ═══ Part 9: Update existing trip_entries RLS ═══
-- Replace the public_read policy with shared_read using can_see_trip()
DROP POLICY IF EXISTS trip_entries_public_read ON trip_entries;
DROP POLICY IF EXISTS trip_entries_shared_read ON trip_entries
    FOR SELECT USING (
        user_id = auth.uid()
        OR (status = 'published' AND can_see_trip(trip_id))
    );

-- ═══ Part 10: Update trip_media RLS ═══
DROP POLICY IF EXISTS trip_media_public_read ON trip_media;
DROP POLICY IF EXISTS trip_media_shared_read ON trip_media
    FOR SELECT USING (
        user_id = auth.uid()
        OR can_see_trip(trip_id)
    );

-- ═══ Part 11: Update trip_comments RLS ═══
DROP POLICY IF EXISTS trip_comments_read_public ON trip_comments;
DROP POLICY IF EXISTS trip_comments_shared_read ON trip_comments
    FOR SELECT USING (
        EXISTS(SELECT 1 FROM trip_entries te
               WHERE te.id = trip_comments.entry_id
               AND can_see_trip(te.trip_id))
    );
-- Update insert: must pass can_comment check
DROP POLICY IF EXISTS trip_comments_insert ON trip_comments;
DROP POLICY IF EXISTS trip_comments_insert ON trip_comments
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS(SELECT 1 FROM trip_entries te
                   WHERE te.id = trip_comments.entry_id
                   AND can_comment(te.trip_id))
    );

-- ═══ Part 12: Update trip_likes RLS ═══
DROP POLICY IF EXISTS trip_likes_read_public ON trip_likes;
DROP POLICY IF EXISTS trip_likes_shared_read ON trip_likes
    FOR SELECT USING (
        EXISTS(SELECT 1 FROM trip_entries te
               WHERE te.id = trip_likes.entry_id
               AND can_see_trip(te.trip_id))
    );
DROP POLICY IF EXISTS trip_likes_insert ON trip_likes;
DROP POLICY IF EXISTS trip_likes_insert ON trip_likes
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS(SELECT 1 FROM trip_entries te
                   WHERE te.id = trip_likes.entry_id
                   AND can_see_trip(te.trip_id))
    );

-- ═══ Part 13: Update trip_plan_items RLS ═══
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items
    FOR SELECT USING (
        user_id = auth.uid()
        OR (can_see_trip(trip_id)
            AND EXISTS(SELECT 1 FROM trips
                       WHERE id = trip_plan_items.trip_id
                       AND plan_items_public = true))
    );

-- ═══ Part 14: Update trips RLS ═══
DROP POLICY IF EXISTS trips_public_read ON trips;
DROP POLICY IF EXISTS "Users can view their own trips" ON trips;
DROP POLICY IF EXISTS trips_select ON trips
    FOR SELECT USING (
        user_id = auth.uid()
        OR visibility = 'public'
        OR EXISTS(SELECT 1 FROM trip_shares
                  WHERE trip_id = trips.id
                  AND shared_with_user_id = auth.uid())
    );

-- ═══ Part 15: GRANTs ═══
GRANT SELECT, INSERT, UPDATE, DELETE ON user_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_shares TO authenticated;
GRANT SELECT, INSERT, DELETE ON trip_gps_tracks TO authenticated;
GRANT SELECT ON visible_plan_items TO authenticated;
GRANT SELECT ON visible_plan_items TO anon;

-- Revoke anon write grants we accidentally gave earlier
REVOKE INSERT, UPDATE, DELETE ON trip_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON trip_media FROM anon;
