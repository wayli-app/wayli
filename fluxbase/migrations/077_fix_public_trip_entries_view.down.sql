-- Revert to public-only entries view
DROP VIEW IF EXISTS public_trip_entries;
CREATE VIEW public_trip_entries AS
SELECT
    e.id, e.trip_id, e.user_id AS trip_user_id, e.title, e.body,
    e.entry_date, e.end_date,
    t.title AS trip_title, t.description AS trip_description,
    t.image_url AS trip_image_url, t.user_id AS trip_owner_id,
    t.start_date AS trip_start, t.end_date AS trip_end,
    t.visibility AS trip_visibility,
    e.cover_media_id
FROM trip_entries e
INNER JOIN trips t ON t.id = e.trip_id
WHERE e.status = 'published'
  AND (t.user_id = auth.uid() OR t.visibility = 'public');
