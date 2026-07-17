-- Consolidation migration: ensures ALL trip sharing infrastructure exists
-- Fixes cases where migrations 059-062 partially failed on production

-- ═══ Ensure tables exist ═══
CREATE TABLE IF NOT EXISTS user_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    friend_id UUID NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, friend_id)
);
ALTER TABLE user_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trip_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    shared_with_user_id UUID NOT NULL,
    role text DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(trip_id, shared_with_user_id)
);
ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trip_gps_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    points jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE trip_gps_tracks ENABLE ROW LEVEL SECURITY;

-- ═══ Ensure columns exist ═══
ALTER TABLE trips ADD COLUMN IF NOT EXISTS costs_visible_to text DEFAULT 'private'
    CHECK (costs_visible_to IN ('private', 'friends', 'public'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS gps_visible_to text DEFAULT 'private'
    CHECK (gps_visible_to IN ('private', 'friends', 'public'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS comments_allowed text DEFAULT 'friends'
    CHECK (comments_allowed IN ('owner', 'friends', 'public'));
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS discoverable text DEFAULT 'everyone'
    CHECK (discoverable IN ('everyone', 'friends_of_friends', 'nobody'));

-- ═══ Ensure functions exist ═══
CREATE OR REPLACE FUNCTION public.is_trip_owner(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_see_trip(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(
        SELECT 1 FROM trips WHERE id = trip_uuid
        AND (user_id = auth.uid() OR visibility = 'public'
             OR EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
    ) OR EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND visibility = 'public');
$$;

CREATE OR REPLACE FUNCTION public.can_see_costs(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (costs_visible_to = 'public' AND visibility = 'public')
        OR (costs_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_see_gps(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (gps_visible_to = 'public' AND visibility = 'public')
        OR (gps_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_comment(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR comments_allowed = 'public'
        OR (comments_allowed IN ('friends', 'public')
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
    ));
$$;

-- ═══ Ensure views exist ═══
DROP VIEW IF EXISTS public_trip_entries CASCADE;
DROP VIEW IF EXISTS public_trip_media CASCADE;
DROP VIEW IF EXISTS visible_plan_items CASCADE;
DROP VIEW IF EXISTS my_trip_entries CASCADE;
CREATE VIEW public_trip_entries AS
SELECT te.id, te.trip_id, te.user_id, te.title, te.body,
       te.entry_date, te.end_date, te.status, te.cover_media_id,
       te.cover_focal_x, te.cover_focal_y, te.created_at, te.updated_at,
       t.title as trip_title, t.image_url as trip_image_url
FROM trip_entries te
JOIN trips t ON t.id = te.trip_id
WHERE t.visibility = 'public' AND te.status = 'published';

CREATE VIEW public_trip_media AS
SELECT tm.* FROM trip_media tm
JOIN trips t ON t.id = tm.trip_id
WHERE t.visibility = 'public';

CREATE VIEW visible_plan_items AS
SELECT tpi.id, tpi.trip_id, tpi.user_id, tpi.day_number, tpi.sort_order,
    tpi.title, tpi.description, tpi.type, tpi.start_time, tpi.end_time,
    tpi.location_lat, tpi.location_lng, tpi.address,
    tpi.booking_url, tpi.booking_status, tpi.want_to_visit_id,
    tpi.notes, tpi.created_by, tpi.created_at, tpi.updated_at,
    CASE WHEN can_see_costs(tpi.trip_id) THEN tpi.cost_estimate ELSE NULL END AS cost_estimate,
    CASE WHEN can_see_costs(tpi.trip_id) THEN tpi.currency ELSE NULL END AS currency
FROM trip_plan_items tpi
WHERE can_see_trip(tpi.trip_id);

CREATE VIEW my_trip_entries AS
SELECT te.id, te.trip_id, te.user_id, te.title, te.body, te.entry_date,
       te.end_date, te.created_at, te.updated_at,
       t.title as trip_title, t.start_date as trip_start, t.end_date as trip_end,
       t.image_url as trip_image_url
FROM trip_entries te
JOIN trips t ON t.id = te.trip_id
WHERE te.user_id = auth.uid();

-- ═══ Ensure RLS policies exist (all idempotent) ═══

-- Trips: simple owner or public (avoids recursion)
DROP POLICY IF EXISTS trips_select ON trips;
DROP POLICY IF EXISTS "Users can view their own trips" ON trips;
DROP POLICY IF EXISTS trips_public_read ON trips;
CREATE POLICY trips_select ON trips FOR SELECT USING (
    user_id = auth.uid() OR visibility = 'public'
);

-- Trip entries
DROP POLICY IF EXISTS trip_entries_shared_read ON trip_entries;
DROP POLICY IF EXISTS trip_entries_public_read ON trip_entries;
DROP POLICY IF EXISTS trip_entries_owner_select ON trip_entries;
CREATE POLICY trip_entries_owner_select ON trip_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trip_entries_shared_read ON trip_entries FOR SELECT USING (
    user_id = auth.uid()
    OR (status = 'published' AND EXISTS(
        SELECT 1 FROM trips t WHERE t.id = trip_entries.trip_id
        AND (t.user_id = auth.uid() OR t.visibility = 'public')
    ))
);

-- Trip media
DROP POLICY IF EXISTS trip_media_shared_read ON trip_media;
DROP POLICY IF EXISTS trip_media_public_read ON trip_media;
DROP POLICY IF EXISTS trip_media_owner_select ON trip_media;
CREATE POLICY trip_media_owner_select ON trip_media FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trip_media_shared_read ON trip_media FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS(SELECT 1 FROM trips t WHERE t.id = trip_media.trip_id
              AND (t.user_id = auth.uid() OR t.visibility = 'public'))
);

-- Trip plan items
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
CREATE POLICY trip_plan_items_select ON trip_plan_items FOR SELECT USING (
    user_id = auth.uid()
    OR (can_see_trip(trip_id)
        AND EXISTS(SELECT 1 FROM trips WHERE id = trip_plan_items.trip_id AND plan_items_public = true))
);

-- Trip shares
DROP POLICY IF EXISTS trip_shares_select ON trip_shares;
CREATE POLICY trip_shares_select ON trip_shares FOR SELECT USING (
    shared_with_user_id = auth.uid() OR is_trip_owner(trip_id)
);
DROP POLICY IF EXISTS trip_shares_insert ON trip_shares;
CREATE POLICY trip_shares_insert ON trip_shares FOR INSERT WITH CHECK (is_trip_owner(trip_id));
DROP POLICY IF EXISTS trip_shares_delete ON trip_shares;
CREATE POLICY trip_shares_delete ON trip_shares FOR DELETE USING (is_trip_owner(trip_id));

-- Trip gps tracks
DROP POLICY IF EXISTS trip_gps_tracks_select ON trip_gps_tracks;
CREATE POLICY trip_gps_tracks_select ON trip_gps_tracks FOR SELECT USING (
    user_id = auth.uid() OR can_see_gps(trip_id)
);
DROP POLICY IF EXISTS trip_gps_tracks_insert ON trip_gps_tracks;
CREATE POLICY trip_gps_tracks_insert ON trip_gps_tracks FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS trip_gps_tracks_delete ON trip_gps_tracks;
CREATE POLICY trip_gps_tracks_delete ON trip_gps_tracks FOR DELETE USING (user_id = auth.uid());

-- User connections
DROP POLICY IF EXISTS user_connections_select ON user_connections;
CREATE POLICY user_connections_select ON user_connections FOR SELECT USING (
    user_id = auth.uid() OR friend_id = auth.uid()
);
DROP POLICY IF EXISTS user_connections_insert ON user_connections;
CREATE POLICY user_connections_insert ON user_connections FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_connections_update ON user_connections;
CREATE POLICY user_connections_update ON user_connections FOR UPDATE USING (friend_id = auth.uid());
DROP POLICY IF EXISTS user_connections_delete ON user_connections;
CREATE POLICY user_connections_delete ON user_connections FOR DELETE USING (
    user_id = auth.uid() OR friend_id = auth.uid()
);

-- Trip comments
DROP POLICY IF EXISTS trip_comments_shared_read ON trip_comments;
DROP POLICY IF EXISTS trip_comments_read_public ON trip_comments;
DROP POLICY IF EXISTS trip_comments_owner_read ON trip_comments;
CREATE POLICY trip_comments_owner_read ON trip_comments FOR SELECT USING (
    EXISTS(SELECT 1 FROM trip_entries te JOIN trips t ON t.id = te.trip_id
           WHERE te.id = trip_comments.entry_id AND t.user_id = auth.uid())
);
CREATE POLICY trip_comments_shared_read ON trip_comments FOR SELECT USING (
    EXISTS(SELECT 1 FROM trip_entries te JOIN trips t ON t.id = te.trip_id
           WHERE te.id = trip_comments.entry_id
           AND (t.user_id = auth.uid() OR t.visibility = 'public'))
);

-- Trip likes
DROP POLICY IF EXISTS trip_likes_shared_read ON trip_likes;
DROP POLICY IF EXISTS trip_likes_read_public ON trip_likes;
DROP POLICY IF EXISTS trip_likes_owner_read ON trip_likes;
CREATE POLICY trip_likes_owner_read ON trip_likes FOR SELECT USING (
    EXISTS(SELECT 1 FROM trip_entries te JOIN trips t ON t.id = te.trip_id
           WHERE te.id = trip_likes.entry_id AND t.user_id = auth.uid())
);
CREATE POLICY trip_likes_shared_read ON trip_likes FOR SELECT USING (
    EXISTS(SELECT 1 FROM trip_entries te JOIN trips t ON t.id = te.trip_id
           WHERE te.id = trip_likes.entry_id
           AND (t.user_id = auth.uid() OR t.visibility = 'public'))
);

-- ═══ GRANTs ═══
GRANT SELECT, INSERT, UPDATE, DELETE ON user_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_shares TO authenticated;
GRANT SELECT, INSERT, DELETE ON trip_gps_tracks TO authenticated;
GRANT SELECT ON visible_plan_items TO authenticated;
GRANT SELECT ON visible_plan_items TO anon;
GRANT SELECT ON public_trip_entries TO authenticated;
GRANT SELECT ON public_trip_entries TO anon;
GRANT SELECT ON public_trip_media TO authenticated;
GRANT SELECT ON public_trip_media TO anon;
GRANT SELECT ON my_trip_entries TO authenticated;
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO anon;
GRANT SELECT ON trips TO authenticated;
GRANT SELECT ON trips TO anon;
GRANT SELECT ON trip_entries TO anon;
GRANT SELECT ON trip_media TO anon;
GRANT SELECT ON trip_comments TO anon;
GRANT SELECT ON trip_likes TO anon;

-- Convert old 'unlisted' trips
UPDATE trips SET visibility = 'private' WHERE visibility = 'unlisted';
