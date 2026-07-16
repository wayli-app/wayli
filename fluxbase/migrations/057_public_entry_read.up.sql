-- Allow reading journal entries for public trips (for landing page + anonymous visitors)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'trip_entries'
        AND policyname = 'trip_entries_public_read'
    ) THEN
        CREATE POLICY trip_entries_public_read ON trip_entries
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM trips
                    WHERE id = trip_entries.trip_id
                    AND visibility = 'public'
                )
            );
    END IF;
END $$;

GRANT SELECT ON trip_entries TO anon;
