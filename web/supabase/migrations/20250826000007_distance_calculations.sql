-- Distance Calculations Migration
-- This migration creates functions for calculating distances between tracking points

-- Function to update distance and time_spent for all tracker_data records using window functions
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
        distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
        time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
        speed = LEAST(ROUND((CASE WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent) ELSE 0 END)::numeric, 2), 9999999999.99),
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

-- Function to automatically calculate distance and time_spent for new/updated records
CREATE OR REPLACE FUNCTION trigger_calculate_distance()
RETURNS TRIGGER AS $$
DECLARE
    prev_point RECORD;
    calculated_distance DECIMAL;
    calculated_time_spent DECIMAL;
BEGIN
    -- Only calculate if location is provided and it's an INSERT or location changed
    IF NEW.location IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.location IS DISTINCT FROM NEW.location) THEN
        -- Find the previous point for this user based on recorded_at
        SELECT
            location,
            recorded_at
        INTO prev_point
        FROM public.tracker_data
        WHERE user_id = NEW.user_id
        AND recorded_at < NEW.recorded_at
        AND location IS NOT NULL
        ORDER BY recorded_at DESC
        LIMIT 1;

        IF prev_point IS NOT NULL THEN
            -- Calculate distance from previous point
            calculated_distance := ST_DistanceSphere(prev_point.location, NEW.location);
            NEW.distance := calculated_distance;

            -- Calculate time spent (time difference in seconds from previous point)
            calculated_time_spent := EXTRACT(EPOCH FROM (NEW.recorded_at - prev_point.recorded_at));
            NEW.time_spent := calculated_time_spent;

            -- Calculate instantaneous speed in m/s with clamping to avoid overflow
            IF calculated_time_spent > 0 THEN
                NEW.speed := LEAST(ROUND(((calculated_distance / calculated_time_spent))::numeric, 2), 9999999999.99);
            ELSE
                NEW.speed := 0;
            END IF;
        ELSE
            -- First point for this user - set distance and time_spent to 0
            NEW.distance := 0;
            NEW.time_spent := 0;
            NEW.speed := 0;
        END IF;

        -- Set updated timestamp
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically calculate distance for new records
DROP TRIGGER IF EXISTS tracker_data_distance_trigger ON public.tracker_data;
CREATE TRIGGER tracker_data_distance_trigger
    BEFORE INSERT OR UPDATE ON public.tracker_data
    FOR EACH ROW
    EXECUTE FUNCTION trigger_calculate_distance();

-- Helper functions for managing triggers during bulk operations
CREATE OR REPLACE FUNCTION disable_tracker_data_trigger()
RETURNS void AS $$
BEGIN
    ALTER TABLE public.tracker_data DISABLE TRIGGER tracker_data_distance_trigger;
    RAISE NOTICE 'Disabled tracker_data_distance_trigger for bulk operations';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enable_tracker_data_trigger()
RETURNS void AS $$
BEGIN
    ALTER TABLE public.tracker_data ENABLE TRIGGER tracker_data_distance_trigger;
    RAISE NOTICE 'Enabled tracker_data_distance_trigger';
END;
$$ LANGUAGE plpgsql;

-- Function to safely perform bulk import with optimized distance calculation
CREATE OR REPLACE FUNCTION perform_bulk_import_with_distance_calculation(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    RAISE NOTICE 'Starting bulk import optimization for user %...', target_user_id;

    -- Disable trigger for better performance during import
    PERFORM disable_tracker_data_trigger();

    -- Calculate distances and time_spent for the imported user's data
    SELECT update_tracker_distances(target_user_id) INTO updated_count;

    -- Re-enable trigger
    PERFORM enable_tracker_data_trigger();

    RAISE NOTICE 'Bulk import optimization complete for user %. Updated % records.', target_user_id, updated_count;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update distances in batches for large datasets
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
                    ELSE EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
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

-- Create a lightweight function for very small batches (useful for real-time updates)
CREATE OR REPLACE FUNCTION update_tracker_distances_small_batch(
    target_user_id UUID DEFAULT NULL,
    max_records INTEGER DEFAULT 100  -- Very small batch size
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
BEGIN
    -- Set very short timeout
    SET statement_timeout = '30s';  -- 30 seconds

    -- Simple, fast update for small batches
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
                ELSE EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
            END AS calculated_time_spent
        FROM public.tracker_data t1
        WHERE t1.location IS NOT NULL
          AND (t1.distance IS NULL OR t1.distance = 0)
          AND (target_user_id IS NULL OR t1.user_id = target_user_id)
        ORDER BY t1.user_id, t1.recorded_at
        LIMIT max_records
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

    GET DIAGNOSTICS total_updated = ROW_COUNT;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION update_tracker_distances IS 'Updates distance and time_spent columns for all tracker_data records by calculating from previous chronological point. Can target specific user for performance.';
COMMENT ON FUNCTION update_tracker_distances_batch IS 'Updates distance and time_spent columns in optimized batches for large datasets. Includes execution time limits and improved performance.';
COMMENT ON FUNCTION update_tracker_distances_small_batch IS 'Lightweight distance calculation function for small batches with very short timeout (30s).';
COMMENT ON FUNCTION trigger_calculate_distance IS 'Trigger function to automatically calculate distance and time_spent for new tracker_data records';
COMMENT ON FUNCTION disable_tracker_data_trigger IS 'Temporarily disables distance calculation trigger for bulk operations';
COMMENT ON FUNCTION enable_tracker_data_trigger IS 'Re-enables distance calculation trigger after bulk operations';
COMMENT ON FUNCTION perform_bulk_import_with_distance_calculation IS 'Optimized bulk import helper that disables triggers, calculates distances, and re-enables triggers';
COMMENT ON COLUMN public.tracker_data.distance IS 'Distance in meters from the previous chronological point for this user';
COMMENT ON COLUMN public.tracker_data.time_spent IS 'Time spent in seconds from the previous chronological point for this user';
COMMENT ON COLUMN public.tracker_data.tz_diff IS 'Timezone difference from UTC in hours (e.g., +2.0 for UTC+2, -5.0 for UTC-5)';

-- Grant execute permission on the new functions
GRANT EXECUTE ON FUNCTION update_tracker_distances_batch(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_tracker_distances_small_batch(UUID, INTEGER) TO authenticated;
