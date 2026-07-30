-- 030: Public trip track RPC with home-address redaction
-- Returns the GPS polyline for a public trip, excluding points within 500m of home.

CREATE OR REPLACE FUNCTION get_public_trip_track(trip_uuid uuid)
RETURNS TABLE(lat double precision, lng double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    trip_user_id uuid;
    trip_start date;
    trip_end date;
    home_lat double precision;
    home_lng double precision;
    home_point geography;
BEGIN
    -- Verify the trip is public
    SELECT user_id, start_date, end_date
    INTO trip_user_id, trip_start, trip_end
    FROM trips
    WHERE id = trip_uuid AND visibility = 'public';

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Get home address coordinates (if set)
    SELECT
        (home_address->>'lat')::double precision,
        (home_address->>'lon')::double precision
    INTO home_lat, home_lng
    FROM user_profiles
    WHERE id = trip_user_id AND home_address IS NOT NULL;

    -- Build a geography point for distance comparison (meters)
    IF home_lat IS NOT NULL AND home_lng IS NOT NULL THEN
        home_point := ST_SetSRID(ST_MakePoint(home_lng, home_lat), 4326)::geography;
    END IF;

    -- Return GPS points within the trip date range, excluding a 500m radius around home
    RETURN QUERY
    SELECT
        ST_Y(location::geometry)::double precision AS lat,
        ST_X(location::geometry)::double precision AS lng
    FROM tracker_data
    WHERE user_id = trip_user_id
        AND recorded_at >= trip_start::timestamptz
        AND recorded_at <= (trip_end + INTERVAL '1 day')::timestamptz
        AND (
            home_point IS NULL
            OR NOT ST_DWithin(location::geography, home_point, 500)
        )
    ORDER BY recorded_at;
END;
$$;

COMMENT ON FUNCTION get_public_trip_track(uuid) IS
    'Returns the GPS track for a public trip, with a 500m exclusion zone around the owner''s home address. SECURITY DEFINER — bypasses RLS to read tracker_data + user_profiles.home_address for filtering only.';

-- Allow anon + authenticated to call the RPC
GRANT EXECUTE ON FUNCTION get_public_trip_track(uuid) TO anon, authenticated;
