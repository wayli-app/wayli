-- Enhanced Speed Calculation Migration
-- This migration creates improved functions for calculating stable, mode-aware speeds

-- Function to calculate stable speed using multiple points and outlier filtering
CREATE OR REPLACE FUNCTION calculate_stable_speed(
    user_id_param UUID,
    recorded_at_param TIMESTAMPTZ,
    window_size INTEGER DEFAULT 5
)
RETURNS DECIMAL AS $$
DECLARE
    speed_result DECIMAL := 0;
    point_count INTEGER;
    valid_speeds DECIMAL[];
    median_speed DECIMAL;
    avg_speed DECIMAL;
    outlier_threshold DECIMAL;
BEGIN
    SET search_path = public;

    -- Get points in window around the target point
    WITH point_window AS (
        SELECT
            location,
            recorded_at,
            ST_DistanceSphere(
                LAG(location) OVER (ORDER BY recorded_at),
                location
            ) AS distance,
            EXTRACT(EPOCH FROM (recorded_at - LAG(recorded_at) OVER (ORDER BY recorded_at))) AS time_diff
        FROM tracker_data
        WHERE user_id = user_id_param
          AND location IS NOT NULL
          AND recorded_at BETWEEN (recorded_at_param - INTERVAL '10 minutes')
                              AND (recorded_at_param + INTERVAL '10 minutes')
        ORDER BY recorded_at
    ),
    speed_calculations AS (
        SELECT
            CASE
                WHEN time_diff > 0 AND distance > 10 THEN -- Minimum 10m distance
                    (distance / time_diff) * 3.6 -- Convert m/s to km/h
                ELSE NULL
            END AS speed_kmh
        FROM point_window
        WHERE distance IS NOT NULL
          AND time_diff IS NOT NULL
          AND time_diff > 0
          AND distance > 10
        ORDER BY recorded_at
        LIMIT window_size
    )
    SELECT
        ARRAY_AGG(speed_kmh ORDER BY speed_kmh),
        COUNT(*)
    INTO valid_speeds, point_count
    FROM speed_calculations
    WHERE speed_kmh IS NOT NULL
      AND speed_kmh > 0
      AND speed_kmh < 500; -- Maximum realistic speed

    -- Need at least 3 points for stable calculation
    IF point_count < 3 THEN
        RETURN 0;
    END IF;

    -- Calculate median speed (more robust than average)
    median_speed := valid_speeds[CEIL(point_count::DECIMAL / 2)];

    -- Calculate average speed
    SELECT AVG(speed) INTO avg_speed
    FROM UNNEST(valid_speeds) AS speed;

    -- Calculate outlier threshold (2 standard deviations)
    WITH speed_stats AS (
        SELECT
            AVG(speed) as mean_speed,
            STDDEV(speed) as std_dev
        FROM UNNEST(valid_speeds) AS speed
    )
    SELECT mean_speed + (2 * std_dev)
    INTO outlier_threshold
    FROM speed_stats;

    -- Filter out outliers and use median if available, otherwise average
    IF median_speed IS NOT NULL AND median_speed < outlier_threshold THEN
        speed_result := median_speed;
    ELSIF avg_speed IS NOT NULL AND avg_speed < outlier_threshold THEN
        speed_result := avg_speed;
    ELSE
        -- If all speeds are outliers, use the most recent valid speed
        speed_result := valid_speeds[ARRAY_LENGTH(valid_speeds, 1)];
    END IF;

    -- Final bounds checking
    speed_result := GREATEST(0, LEAST(speed_result, 500));

    RETURN ROUND(speed_result, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate mode-aware speed
CREATE OR REPLACE FUNCTION calculate_mode_aware_speed(
    user_id_param UUID,
    recorded_at_param TIMESTAMPTZ,
    transport_mode TEXT DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
    speed_result DECIMAL := 0;
    window_size INTEGER;
    point_count INTEGER;
    valid_speeds DECIMAL[];
    median_speed DECIMAL;
    avg_speed DECIMAL;
    mode_factor DECIMAL := 1.0;
BEGIN
    SET search_path = public;

    -- Adjust window size based on transport mode
    CASE transport_mode
        WHEN 'walking' THEN window_size := 3;  -- Smaller window for walking
        WHEN 'cycling' THEN window_size := 4;  -- Medium window for cycling
        WHEN 'car' THEN window_size := 5;      -- Standard window for car
        WHEN 'train' THEN window_size := 7;    -- Larger window for train (more stable)
        WHEN 'airplane' THEN window_size := 10; -- Largest window for airplane
        ELSE window_size := 5;                 -- Default window
    END CASE;

    -- Get points in window around the target point
    WITH point_window AS (
        SELECT
            location,
            recorded_at,
            ST_DistanceSphere(
                LAG(location) OVER (ORDER BY recorded_at),
                location
            ) AS distance,
            EXTRACT(EPOCH FROM (recorded_at - LAG(recorded_at) OVER (ORDER BY recorded_at))) AS time_diff
        FROM tracker_data
        WHERE user_id = user_id_param
          AND location IS NOT NULL
          AND recorded_at BETWEEN (recorded_at_param - INTERVAL '15 minutes')
                              AND (recorded_at_param + INTERVAL '15 minutes')
        ORDER BY recorded_at
    ),
    speed_calculations AS (
        SELECT
            CASE
                WHEN time_diff > 0 AND distance > 5 THEN -- Minimum 5m distance
                    (distance / time_diff) * 3.6 -- Convert m/s to km/h
                ELSE NULL
            END AS speed_kmh
        FROM point_window
        WHERE distance IS NOT NULL
          AND time_diff IS NOT NULL
          AND time_diff > 0
          AND distance > 5
        ORDER BY recorded_at
        LIMIT window_size
    )
    SELECT
        ARRAY_AGG(speed_kmh ORDER BY speed_kmh),
        COUNT(*)
    INTO valid_speeds, point_count
    FROM speed_calculations
    WHERE speed_kmh IS NOT NULL
      AND speed_kmh > 0
      AND speed_kmh < 1000; -- Maximum realistic speed

    -- Need at least 2 points for calculation
    IF point_count < 2 THEN
        RETURN 0;
    END IF;

    -- Calculate median speed (more robust than average)
    median_speed := valid_speeds[CEIL(point_count::DECIMAL / 2)];

    -- Calculate average speed
    SELECT AVG(speed) INTO avg_speed
    FROM UNNEST(valid_speeds) AS speed;

    -- Apply mode-specific adjustments
    CASE transport_mode
        WHEN 'walking' THEN
            mode_factor := 0.8; -- Walking speeds are more variable
        WHEN 'cycling' THEN
            mode_factor := 0.9; -- Cycling speeds are moderately variable
        WHEN 'car' THEN
            mode_factor := 1.0; -- Car speeds are standard
        WHEN 'train' THEN
            mode_factor := 1.1; -- Train speeds are more stable
        WHEN 'airplane' THEN
            mode_factor := 1.2; -- Airplane speeds are very stable
        ELSE
            mode_factor := 1.0;
    END CASE;

    -- Use median if available, otherwise average
    IF median_speed IS NOT NULL THEN
        speed_result := median_speed * mode_factor;
    ELSIF avg_speed IS NOT NULL THEN
        speed_result := avg_speed * mode_factor;
    ELSE
        speed_result := 0;
    END IF;

    -- Final bounds checking
    speed_result := GREATEST(0, LEAST(speed_result, 1000));

    RETURN ROUND(speed_result, 2);
END;
$$ LANGUAGE plpgsql;

-- Enhanced function to update tracker distances with stable speed calculation
CREATE OR REPLACE FUNCTION update_tracker_distances_enhanced(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER;
    user_filter TEXT := '';
    batch_size INTEGER := 1000;
    batch_updated INTEGER;
    has_more_records BOOLEAN := TRUE;
BEGIN
    SET search_path = public;
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting enhanced distance and speed calculation for user %...', target_user_id;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting enhanced distance and speed calculation for ALL users...';
    END IF;

    total_updated := 0;

    -- Process in batches to avoid memory issues
    WHILE has_more_records LOOP
        -- Use enhanced speed calculation with multi-point window
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
              AND (t1.distance IS NULL OR t1.distance = 0)
              AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size
        )
        UPDATE public.tracker_data AS td
        SET
            distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
            time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
            -- Use enhanced speed calculation instead of simple division
            speed = LEAST(ROUND(calculate_stable_speed(td.user_id, td.recorded_at, 5)::numeric, 2), 9999999999.99),
            updated_at = NOW()
        FROM distance_and_time_calculations dc
        WHERE td.user_id = dc.user_id
          AND td.recorded_at = dc.recorded_at
          AND td.location = dc.location;

        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        IF batch_updated = 0 THEN
            has_more_records := FALSE;
        ELSE
            total_updated := total_updated + batch_updated;
            RAISE NOTICE 'Updated % records in batch. Total updated: %', batch_updated, total_updated;
        END IF;
    END LOOP;

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Enhanced distance and speed calculation complete for user %. Updated % records.', target_user_id, total_updated;
    ELSE
        RAISE NOTICE 'Enhanced distance and speed calculation complete for ALL users. Updated % records.', total_updated;
    END IF;

    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Enhanced trigger function with stable speed calculation
CREATE OR REPLACE FUNCTION trigger_calculate_distance_enhanced()
RETURNS TRIGGER AS $$
DECLARE
    prev_point RECORD;
    calculated_distance DECIMAL;
    calculated_time_spent DECIMAL;
    stable_speed DECIMAL;
BEGIN
    SET search_path = public;

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

            -- Use enhanced stable speed calculation
            stable_speed := calculate_stable_speed(NEW.user_id, NEW.recorded_at, 5);
            NEW.speed := LEAST(ROUND(stable_speed::numeric, 2), 9999999999.99);
        ELSE
            -- First point for this user - set distance and time_spent to 0
            NEW.distance := 0;
            NEW.time_spent := 0;
            NEW.speed := 0;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION calculate_stable_speed IS 'Calculates stable speed using multiple points and outlier filtering for noise reduction';
COMMENT ON FUNCTION calculate_mode_aware_speed IS 'Calculates speed with transport mode awareness and appropriate window sizes';
COMMENT ON FUNCTION update_tracker_distances_enhanced IS 'Enhanced version that uses stable speed calculation with multi-point windows';
COMMENT ON FUNCTION trigger_calculate_distance_enhanced IS 'Enhanced trigger that uses stable speed calculation for new records';
