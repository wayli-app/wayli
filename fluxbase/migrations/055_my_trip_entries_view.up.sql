-- RLS-scoped view for chatbot access to journal entries
CREATE OR REPLACE VIEW my_trip_entries AS
SELECT
    te.id,
    te.trip_id,
    te.title,
    te.body,
    te.entry_date,
    te.end_date,
    te.created_at,
    te.updated_at,
    t.title as trip_title,
    t.start_date as trip_start,
    t.end_date as trip_end,
    t.image_url as trip_image_url
FROM trip_entries te
JOIN trips t ON t.id = te.trip_id
WHERE te.user_id = auth.uid();

GRANT SELECT ON my_trip_entries TO authenticated;
