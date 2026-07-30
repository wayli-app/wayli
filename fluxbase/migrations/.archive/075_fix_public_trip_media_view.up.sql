-- Fix public_trip_media view to honor trip_shares (migration 073 did this
-- for RLS policies on trip_media but the view wasn't updated).
-- Must DROP first because CREATE OR REPLACE VIEW fails if the column list
-- differs from the existing view (SQLSTATE 42P16: cannot drop columns from view).
DROP VIEW IF EXISTS public_trip_media;
CREATE VIEW public_trip_media AS
SELECT
    m.id,
    m.trip_id,
    m.user_id,
    m.storage_path,
    m.thumbnail_path,
    m.width,
    m.height,
    m.sort_order,
    m.created_at
FROM trip_media m
WHERE EXISTS(
    SELECT 1 FROM trips t
    WHERE t.id = m.trip_id
      AND (
        t.user_id = auth.uid()
        OR t.visibility = 'public'
        OR EXISTS(
            SELECT 1 FROM trip_shares
            WHERE trip_shares.trip_id = t.id
              AND trip_shares.shared_with_user_id = auth.uid()
        )
      )
);
