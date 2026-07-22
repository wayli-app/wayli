-- Revert: restore original policies without trip_shares support
DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips FOR SELECT USING (
    user_id = auth.uid() OR visibility = 'public'
);

DROP POLICY IF EXISTS trip_entries_shared_read ON trip_entries;
CREATE POLICY trip_entries_shared_read ON trip_entries FOR SELECT USING (
    EXISTS(
        SELECT 1 FROM trips
        WHERE trips.id = trip_entries.trip_id
          AND (trips.user_id = auth.uid() OR trips.visibility = 'public')
    )
    AND (trip_entries.user_id = auth.uid() OR trip_entries.status = 'published')
);

DROP POLICY IF EXISTS trip_media_shared_read ON trip_media;
CREATE POLICY trip_media_shared_read ON trip_media FOR SELECT USING (
    EXISTS(
        SELECT 1 FROM trips
        WHERE trips.id = trip_media.trip_id
          AND (trips.user_id = auth.uid() OR trips.visibility = 'public')
    )
);
