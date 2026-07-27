DROP TRIGGER IF EXISTS set_first_user_admin ON auth.users;
DROP FUNCTION IF EXISTS public.set_first_user_admin();

-- Revert public_trip_media to public-only
CREATE OR REPLACE VIEW public_trip_media AS
SELECT
    m.id, m.trip_id, m.user_id, m.storage_path, m.thumbnail_path,
    m.width, m.height, m.sort_order, m.created_at
FROM trip_media m
WHERE EXISTS(
    SELECT 1 FROM trips t
    WHERE t.id = m.trip_id
      AND (t.user_id = auth.uid() OR t.visibility = 'public')
);
