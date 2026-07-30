-- 081_speed_quality.down.sql
-- Reverts 081_speed_quality.up.sql. NOTE: the backfilled speeds (clamped down
-- to 1000) are NOT restored to their original (garbage) values — that data is
-- gone. Reverting restores the original trigger + removes the CHECK + drops the
-- helper function.

-- Drop the CHECK constraint.
ALTER TABLE "public"."tracker_data"
    DROP CONSTRAINT IF EXISTS "tracker_data_plausible_speed";

-- Restore the original, unguarded trigger (002_functions.up.sql).
CREATE OR REPLACE FUNCTION "public"."trigger_calculate_distance"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE prev_point RECORD;
calculated_distance DECIMAL;
calculated_time_spent DECIMAL;
stable_speed DECIMAL;
BEGIN
IF NEW.location IS NOT NULL THEN
SELECT location,
    recorded_at INTO prev_point
FROM public.tracker_data
WHERE user_id = NEW.user_id
    AND recorded_at < NEW.recorded_at
    AND location IS NOT NULL
ORDER BY recorded_at DESC
LIMIT 1;
IF prev_point IS NOT NULL THEN
calculated_distance := public.st_distancesphere(prev_point.location, NEW.location);
NEW.distance := calculated_distance;
calculated_time_spent := EXTRACT(
    EPOCH
    FROM (NEW.recorded_at - prev_point.recorded_at)
);
NEW.time_spent := calculated_time_spent;
IF calculated_time_spent > 0 THEN stable_speed := (calculated_distance / calculated_time_spent) * 3.6;
ELSE stable_speed := 0;
END IF;
NEW.speed := LEAST(ROUND(stable_speed::numeric, 2), 9999999999.99);
ELSE
NEW.distance := 0;
NEW.time_spent := 0;
NEW.speed := 0;
END IF;
NEW.updated_at := NOW();
END IF;
RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS "public"."MAX_PLAUSIBLE_SPEED_KMH"();
