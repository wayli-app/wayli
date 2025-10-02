-- Fix distance calculation batch function to properly process records
-- The previous version had an issue where the LAG() window function couldn't
-- access previous records that weren't in the limited batch, causing only
-- a few records to be updated per batch.

-- Drop and recreate the function with improved logic
CREATE OR REPLACE FUNCTION update_tracker_distances_small_batch(
    target_user_id UUID DEFAULT NULL,
    max_records INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    total_updated INTEGER := 0;
BEGIN
    -- Set very short timeout
    SET statement_timeout = '30s';

    -- Improved approach: Select records that need updating, but include
    -- enough context for the LAG() function to work properly
    WITH records_needing_update AS (
        -- Get records that need distance calculation
        SELECT user_id, recorded_at
        FROM public.tracker_data
        WHERE location IS NOT NULL
          AND (distance IS NULL OR distance = 0)
          AND (target_user_id IS NULL OR user_id = target_user_id)
        ORDER BY user_id, recorded_at
        LIMIT max_records
    ),
    distance_and_time_calculations AS (
        -- Calculate distances for those records, but query ALL records for the user
        -- to ensure LAG() has the data it needs
        SELECT
            t1.user_id,
            t1.recorded_at,
            CASE
                WHEN prev.location IS NULL THEN 0
                ELSE public.st_distancesphere(prev.location, t1.location)
            END AS calculated_distance,
            CASE
                WHEN prev.recorded_at IS NULL THEN 0
                ELSE EXTRACT(EPOCH FROM (t1.recorded_at - prev.recorded_at))
            END AS calculated_time_spent
        FROM public.tracker_data t1
        -- Self-join to get previous record for each user
        LEFT JOIN LATERAL (
            SELECT location, recorded_at
            FROM public.tracker_data
            WHERE user_id = t1.user_id
              AND recorded_at < t1.recorded_at
              AND location IS NOT NULL
            ORDER BY recorded_at DESC
            LIMIT 1
        ) prev ON true
        WHERE EXISTS (
            SELECT 1 FROM records_needing_update rnu
            WHERE rnu.user_id = t1.user_id
              AND rnu.recorded_at = t1.recorded_at
        )
    )
    UPDATE public.tracker_data AS td
    SET
        distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
        time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
        speed = LEAST(ROUND((CASE
            WHEN dc.calculated_time_spent > 0
            THEN (dc.calculated_distance / dc.calculated_time_spent) * 3.6
            ELSE 0
        END)::numeric, 2), 9999999999.99),
        updated_at = NOW()
    FROM distance_and_time_calculations dc
    WHERE td.user_id = dc.user_id
      AND td.recorded_at = dc.recorded_at;

    GET DIAGNOSTICS total_updated = ROW_COUNT;
    RETURN total_updated;
END;
$$;

COMMENT ON FUNCTION update_tracker_distances_small_batch IS 'Lightweight distance calculation function for small batches with very short timeout (30s). Uses LATERAL join to properly access previous records for LAG calculation.';
