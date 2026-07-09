-- 036: Simplify get_public_trip_track — raw track, no home filtering
-- Home-address exclusion removed; users will control privacy via individual
-- point removal (planned feature). The RPC now just returns the raw GPS
-- track for a trip that is public OR owned by the caller.

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
BEGIN
    SELECT user_id, start_date, end_date
    INTO trip_user_id, trip_start, trip_end
    FROM trips
    WHERE id = trip_uuid
    AND (visibility = 'public' OR user_id = auth.uid() OR share_token IS NOT NULL);

    IF NOT FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        ST_Y(location::geometry)::double precision AS lat,
        ST_X(location::geometry)::double precision AS lng
    FROM tracker_data
    WHERE user_id = trip_user_id
        AND recorded_at >= trip_start::timestamptz
        AND recorded_at <= (trip_end + INTERVAL '1 day')::timestamptz
    ORDER BY recorded_at;
END;
$$;

COMMENT ON FUNCTION get_public_trip_track(uuid) IS
    'Returns the raw GPS track for a trip. Accessible when the trip is public OR the caller is the owner. SECURITY DEFINER — bypasses tracker_data RLS.';

GRANT EXECUTE ON FUNCTION get_public_trip_track(uuid) TO anon, authenticated;
