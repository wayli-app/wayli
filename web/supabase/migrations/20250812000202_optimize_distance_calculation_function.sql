-- Optimize the distance calculation function for better performance and timeout handling
-- This migration improves the update_tracker_distances_batch function

CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 1000  -- Reduced default batch size
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    user_filter TEXT := '';
    has_more_records BOOLEAN := TRUE;
    start_time TIMESTAMP := clock_timestamp();
    max_execution_time INTERVAL := INTERVAL '5 minutes';  -- Reduced from 10 minutes
BEGIN
    -- Set shorter timeout for this function to prevent long-running operations
    SET statement_timeout = '300s';  -- 5 minutes

    -- Check if we're approaching the execution time limit
    IF clock_timestamp() - start_time > max_execution_time THEN
        RAISE NOTICE 'Function execution time limit approaching, returning partial results';
        RETURN total_updated;
    END IF;

    IF target_user_id IS NOT NULL THEN
        user_filter := ' AND t1.user_id = $1';
    END IF;

    RAISE NOTICE 'Starting optimized distance calculation for records without distances (batch size: %)', batch_size;

    -- Loop until no more records need processing or time limit reached
    WHILE has_more_records AND (clock_timestamp() - start_time) < max_execution_time LOOP
        -- Process only records that don't have distance calculated yet
        WITH distance_and_time_calculations AS (
            SELECT
                t1.user_id,
                t1.recorded_at,
                t1.location,
                CASE
                    WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                    ELSE ST_DistanceSphere(
                        LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                        t1.location
                    )
                END AS calculated_distance,
                CASE
                    WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                    ELSE EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at)))
                END AS calculated_time_spent
            FROM public.tracker_data t1
            WHERE t1.location IS NOT NULL
              AND (t1.distance IS NULL OR t1.distance = 0)  -- Only process records without distance
              AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size
        )
        UPDATE public.tracker_data AS td
        SET
            distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
            time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
            speed = LEAST(ROUND((CASE WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent) ELSE 0 END)::numeric, 2), 9999999999.99)
        FROM distance_and_time_calculations dc
        WHERE td.user_id = dc.user_id
          AND td.recorded_at = dc.recorded_at
          AND td.location = dc.location;

        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        -- If no records were updated, we're done
        IF batch_updated = 0 THEN
            has_more_records := FALSE;
        ELSE
            total_updated := total_updated + batch_updated;
            RAISE NOTICE 'Processed batch: % records, total: %', batch_updated, total_updated;

            -- Check execution time limit
            IF (clock_timestamp() - start_time) >= max_execution_time THEN
                RAISE NOTICE 'Execution time limit reached, returning partial results: % records updated', total_updated;
                has_more_records := FALSE;
            ELSE
                -- Small delay to prevent overwhelming the database
                PERFORM pg_sleep(0.05);  -- Reduced from 0.1s
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Optimized distance calculation completed: % total records updated in %',
                 total_updated,
                 clock_timestamp() - start_time;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Update the function comment
COMMENT ON FUNCTION update_tracker_distances_batch IS 'Updates distance and time_spent columns in optimized batches for large datasets. Includes execution time limits and improved performance.';
