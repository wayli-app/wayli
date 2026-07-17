-- Simplify RLS policies to avoid function-call issues
-- The can_see_trip() function works but calling it from RLS causes issues
-- in some Fluxbase API configurations. Use direct column checks instead.
-- Trip sharing is still handled by the security functions for granular
-- access (costs, GPS, comments) but the base trip visibility uses
-- simple inline checks.

-- Trips: owner or public
DROP POLICY IF EXISTS trips_select ON trips;
DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips FOR SELECT USING (
    user_id = auth.uid()
    OR visibility = 'public'
);

-- Trip entries: owner or published on visible trips
DROP POLICY IF EXISTS trip_entries_shared_read ON trip_entries;
DROP POLICY IF EXISTS trip_entries_shared_read ON trip_entries;
CREATE POLICY trip_entries_shared_read ON trip_entries FOR SELECT USING (
    user_id = auth.uid()
    OR (status = 'published' AND EXISTS(
        SELECT 1 FROM trips t
        WHERE t.id = trip_entries.trip_id
        AND (t.user_id = auth.uid() OR t.visibility = 'public')
    ))
);

-- Trip media: owner or on visible trips
DROP POLICY IF EXISTS trip_media_shared_read ON trip_media;
DROP POLICY IF EXISTS trip_media_shared_read ON trip_media;
CREATE POLICY trip_media_shared_read ON trip_media FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS(
        SELECT 1 FROM trips t
        WHERE t.id = trip_media.trip_id
        AND (t.user_id = auth.uid() OR t.visibility = 'public')
    )
);

-- Trip shares: use is_trip_owner() SECURITY DEFINER function
DROP POLICY IF EXISTS trip_shares_select ON trip_shares;
DROP POLICY IF EXISTS trip_shares_select ON trip_shares;
CREATE POLICY trip_shares_select ON trip_shares FOR SELECT USING (
    shared_with_user_id = auth.uid()
    OR is_trip_owner(trip_id)
);
