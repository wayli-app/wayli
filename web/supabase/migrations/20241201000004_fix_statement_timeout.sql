-- Fix statement_timeout values in existing database functions
-- This migration recreates functions with the correct PostgreSQL timeout syntax

-- Recreate update_tracker_distances function with correct timeout
CREATE OR REPLACE FUNCTION update_tracker_distances(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER;
    user_filter TEXT := '';
BEGIN
    -- Set a longer statement timeout for this function (fixed syntax)
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting distance and time_spent calculation for user % using optimized window function approach...', target_user_id;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting distance and time_spent calculation for ALL users using optimized window function approach...';
    END IF;

    -- Use a single UPDATE with window functions and JOIN for much better performance
    WITH distance_and_time_calculations AS (
        SELECT
            t1.user_id,
            t1.recorded_at,
            t1.location,
            CASE
                WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                    0  -- First point for each user
                ELSE
                    ST_DistanceSphere(
                        LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                        t1.location
                    )
            END AS calculated_distance,
            CASE
                WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                    0  -- First point for each user
                ELSE
                    EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at)))
            END AS calculated_time_spent
        FROM public.tracker_data t1
        WHERE t1.location IS NOT NULL
        AND (target_user_id IS NULL OR t1.user_id = target_user_id)
    )
    UPDATE public.tracker_data
    SET
        distance = dc.calculated_distance,
        time_spent = dc.calculated_time_spent,
        speed = LEAST(
            ROUND((
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent)
                    ELSE 0
                END
            )::numeric, 2),
            9999999999.99
        ),
        updated_at = NOW()
    FROM distance_and_time_calculations dc
    WHERE tracker_data.user_id = dc.user_id
    AND tracker_data.recorded_at = dc.recorded_at
    AND tracker_data.location = dc.location;

    -- Get count of updated records
    GET DIAGNOSTICS total_updated = ROW_COUNT;

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Distance and time_spent calculation complete for user %. Updated % records using window functions.', target_user_id, total_updated;
    ELSE
        RAISE NOTICE 'Distance and time_spent calculation complete for ALL users. Updated % records using window functions.', total_updated;
    END IF;

    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Recreate update_tracker_distances_batch function with correct timeout
CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    offset_val INTEGER := 0;
    has_more BOOLEAN := true;
    user_filter TEXT := '';
BEGIN
    -- Set a longer statement timeout for this function (fixed syntax)
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting batched distance calculation for user % (batch size: %)...', target_user_id, batch_size;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting batched distance calculation for ALL users (batch size: %)...', batch_size;
    END IF;

    -- Process data in batches to avoid memory issues
    WHILE has_more LOOP
        WITH distance_and_time_calculations AS (
            SELECT
                t1.user_id,
                t1.recorded_at,
                t1.location,
                CASE
                    WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                        0  -- First point for each user
                    ELSE
                        ST_DistanceSphere(
                            LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                            t1.location
                        )
                END AS calculated_distance,
                CASE
                    WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                        0  -- First point for each user
                    ELSE
                        EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at)))
                END AS calculated_time_spent
            FROM public.tracker_data t1
            WHERE t1.location IS NOT NULL
            AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size OFFSET offset_val
        )
        UPDATE public.tracker_data
        SET
            distance = dc.calculated_distance,
            time_spent = dc.calculated_time_spent,
            speed = LEAST(
                ROUND((
                    CASE
                        WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent)
                        ELSE 0
                    END
                )::numeric, 2),
                9999999999.99
            ),
            updated_at = NOW()
        FROM distance_and_time_calculations dc
        WHERE tracker_data.user_id = dc.user_id
        AND tracker_data.recorded_at = dc.recorded_at
        AND tracker_data.location = dc.location;

        -- Get count of updated records in this batch
        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        total_updated := total_updated + batch_updated;
        offset_val := offset_val + batch_size;

        -- Check if we have more data to process
        IF batch_updated < batch_size THEN
            has_more := false;
        END IF;

        RAISE NOTICE 'Processed batch: % records updated (total: %)', batch_updated, total_updated;

        -- Small delay to prevent overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;

    RAISE NOTICE 'Batched distance calculation complete. Total records updated: %', total_updated;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION update_tracker_distances IS 'Updates distance and time_spent columns for all tracker_data records by calculating from previous chronological point. Can target specific user for performance. (Fixed timeout syntax)';
COMMENT ON FUNCTION update_tracker_distances_batch IS 'Updates distance and time_spent columns in batches for large datasets to avoid timeouts. Can target specific user for performance. (Fixed timeout syntax)';
