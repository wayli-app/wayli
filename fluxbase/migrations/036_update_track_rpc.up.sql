-- 036: Update get_public_trip_track to also serve trip owners
-- Allows authenticated owners to see their own track (with home exclusion)
-- even when the trip is private. Anon users still only get public trips.

DROP FUNCTION IF EXISTS get_public_trip_track(uuid);

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
    -- Find the trip: allow if public OR if the caller is the owner
    SELECT user_id, start_date, end_date
    INTO trip_user_id, trip_start, trip_end
    FROM trips
    WHERE id = trip_uuid
    AND (visibility = 'public' OR user_id = auth.uid());

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
    'Returns the GPS track for a trip (with 500m home-address exclusion). Accessible when the trip is public OR the caller is the owner. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION get_public_trip_track(uuid) TO anon, authenticated;
