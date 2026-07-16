-- RLS SECURITY FIX: prevent draft entry leaks + revoke anon writes

-- 1. CRITICAL: Fix draft entries leaking to anonymous users
-- The public read policy didn't check status = 'published'
DROP POLICY IF EXISTS trip_entries_public_read ON trip_entries;
CREATE POLICY trip_entries_public_read ON trip_entries
    FOR SELECT USING (
        trip_entries.status = 'published'
        AND EXISTS (
            SELECT 1 FROM trips
            WHERE id = trip_entries.trip_id
            AND visibility = 'public'
        )
    );

-- 2. HIGH: Revoke write grants from anon role
REVOKE INSERT, UPDATE, DELETE ON trip_plan_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON trip_collaborators FROM anon;

-- 3. Defense in depth: hardened views that enforce public filter
-- Even if table-level RLS is wrong, these views cannot leak
CREATE OR REPLACE VIEW public_trip_entries AS
SELECT
    te.id, te.trip_id, te.user_id, te.title, te.body,
    te.entry_date, te.end_date, te.status, te.cover_media_id,
    te.cover_focal_x, te.cover_focal_y, te.created_at, te.updated_at,
    t.title as trip_title, t.image_url as trip_image_url
FROM trip_entries te
JOIN trips t ON t.id = te.trip_id
WHERE t.visibility = 'public' AND te.status = 'published';

CREATE OR REPLACE VIEW public_trip_media AS
SELECT tm.*
FROM trip_media tm
JOIN trips t ON t.id = tm.trip_id
WHERE t.visibility = 'public';

GRANT SELECT ON public_trip_entries TO authenticated;
GRANT SELECT ON public_trip_entries TO anon;
GRANT SELECT ON public_trip_media TO authenticated;
GRANT SELECT ON public_trip_media TO anon;
