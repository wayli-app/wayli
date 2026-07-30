-- Revert security fixes (not recommended)
DROP VIEW IF EXISTS public_trip_entries;
DROP VIEW IF EXISTS public_trip_media;

DROP POLICY IF EXISTS trip_entries_public_read ON trip_entries;
CREATE POLICY trip_entries_public_read ON trip_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM trips
            WHERE id = trip_entries.trip_id
            AND visibility = 'public'
        )
    );

GRANT INSERT, UPDATE, DELETE ON trip_plan_items TO anon;
GRANT INSERT, UPDATE, DELETE ON trip_collaborators TO anon;
