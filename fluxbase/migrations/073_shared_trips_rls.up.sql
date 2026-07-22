-- Add trip_shares recognition to RLS policies on trips, trip_entries, trip_media.
-- Currently only trip_plan_items and trip_gps_tracks use can_see_trip() which
-- honors shares. The core tables only check owner OR public, missing the
-- share-recipient case entirely. This means shared-but-private trips are
-- invisible to share recipients on the landing page, feed page, and public
-- trip detail page.

-- trips: owner OR public OR shared-with-me
DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips FOR SELECT USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR EXISTS(
        SELECT 1 FROM trip_shares
        WHERE trip_shares.trip_id = trips.id
          AND trip_shares.shared_with_user_id = auth.uid()
    )
);

-- trip_entries: owner OR (published AND trip-visible-to-me)
DROP POLICY IF EXISTS trip_entries_shared_read ON trip_entries;
CREATE POLICY trip_entries_shared_read ON trip_entries FOR SELECT USING (
    EXISTS(
        SELECT 1 FROM trips
        WHERE trips.id = trip_entries.trip_id
          AND (
            trips.user_id = auth.uid()
            OR trips.visibility = 'public'
            OR EXISTS(
                SELECT 1 FROM trip_shares
                WHERE trip_shares.trip_id = trips.id
                  AND trip_shares.shared_with_user_id = auth.uid()
            )
          )
    )
    AND (
        trip_entries.user_id = auth.uid()
        OR trip_entries.status = 'published'
    )
);

-- trip_media: owner OR trip-visible-to-me
DROP POLICY IF EXISTS trip_media_shared_read ON trip_media;
CREATE POLICY trip_media_shared_read ON trip_media FOR SELECT USING (
    EXISTS(
        SELECT 1 FROM trips
        WHERE trips.id = trip_media.trip_id
          AND (
            trips.user_id = auth.uid()
            OR trips.visibility = 'public'
            OR EXISTS(
                SELECT 1 FROM trip_shares
                WHERE trip_shares.trip_id = trips.id
                  AND trip_shares.shared_with_user_id = auth.uid()
            )
          )
    )
);
