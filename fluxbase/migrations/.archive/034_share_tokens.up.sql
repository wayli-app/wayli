-- 034: Per-trip share tokens for private journal sharing
-- Allows generating a unique link that grants read access to a specific trip
-- (including private trips) without requiring login.

ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

COMMENT ON COLUMN trips.share_token IS 'Unique token for sharing a private trip via /share/{token}. NULL = not shared.';

-- RPC: fetch a trip + its entries + media by share token (bypasses RLS)
-- Returns NULL if the token doesn't match any trip.
CREATE OR REPLACE FUNCTION get_shared_trip(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    trip_id uuid;
    trip_record jsonb;
    entries jsonb;
    media jsonb;
    profile jsonb;
BEGIN
    -- Find the trip by token
    SELECT id INTO trip_id FROM trips WHERE share_token = p_token;
    IF trip_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get trip data
    SELECT to_jsonb(t.*) INTO trip_record
    FROM trips t WHERE t.id = trip_id;

    -- Get entries
    SELECT COALESCE(jsonb_agg(to_jsonb(e.*) ORDER BY e.entry_date), '[]'::jsonb) INTO entries
    FROM trip_entries e WHERE e.trip_id = trip_id;

    -- Get media
    SELECT COALESCE(jsonb_agg(to_jsonb(m.*) ORDER BY m.sort_order, m.created_at), '[]'::jsonb) INTO media
    FROM trip_media m WHERE m.trip_id = trip_id;

    -- Get owner profile (limited fields)
    SELECT to_jsonb(jsonb_build_object(
        'username', up.username,
        'full_name', up.full_name,
        'avatar_url', up.avatar_url
    )) INTO profile
    FROM user_profiles up
    JOIN trips t ON t.user_id = up.id
    WHERE t.id = trip_id;

    RETURN jsonb_build_object(
        'trip', trip_record,
        'entries', entries,
        'media', media,
        'owner', profile
    );
END;
$$;

COMMENT ON FUNCTION get_shared_trip(text) IS
    'Fetches a trip (including private) + entries + media + owner profile by share token. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION get_shared_trip(text) TO anon, authenticated;
