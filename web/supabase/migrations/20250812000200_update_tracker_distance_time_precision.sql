-- 20250812000200_update_tracker_distance_time_precision.sql
-- Widen distance/time_spent precision and cast before rounding to prevent numeric overflow during imports

-- Increase precision on distance and time_spent
ALTER TABLE public.tracker_data
  ALTER COLUMN distance TYPE numeric(12,2) USING COALESCE(distance, 0)::numeric,
  ALTER COLUMN time_spent TYPE numeric(12,2) USING COALESCE(time_spent, 0)::numeric;

-- Recreate the bulk update function with safe casts and rounding
CREATE OR REPLACE FUNCTION update_tracker_distances(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER;
BEGIN
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
          AND (target_user_id IS NULL OR t1.user_id = target_user_id)
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

-- Create a new optimized batch processing function to prevent timeouts
CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    user_filter TEXT := '';
    has_more_records BOOLEAN := TRUE;
BEGIN
    -- Set longer timeout for this function
    SET statement_timeout = '600s';  -- 10 minutes

    IF target_user_id IS NOT NULL THEN
        user_filter := ' AND t1.user_id = $1';
    END IF;

    RAISE NOTICE 'Starting efficient distance calculation for records without distances (batch size: %)', batch_size;

    -- Loop until no more records need processing
    WHILE has_more_records LOOP
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

            -- Small delay to prevent overwhelming the database
            PERFORM pg_sleep(0.1);
        END IF;
    END LOOP;

    RAISE NOTICE 'Efficient distance calculation completed: % total records updated', total_updated;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger function with safe casts
CREATE OR REPLACE FUNCTION trigger_calculate_distance()
RETURNS TRIGGER AS $$
DECLARE
    prev_point RECORD;
    calculated_distance DOUBLE PRECISION;
    calculated_time_spent DOUBLE PRECISION;
    computed_speed DOUBLE PRECISION;
BEGIN
    IF NEW.location IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.location IS DISTINCT FROM NEW.location) THEN
        SELECT location, recorded_at
          INTO prev_point
          FROM public.tracker_data
         WHERE user_id = NEW.user_id
           AND recorded_at < NEW.recorded_at
           AND location IS NOT NULL
         ORDER BY recorded_at DESC
         LIMIT 1;

        IF prev_point IS NOT NULL THEN
            calculated_distance := ST_DistanceSphere(prev_point.location, NEW.location);
            NEW.distance := LEAST(ROUND(calculated_distance::numeric, 2), 9999999999.99);

            calculated_time_spent := EXTRACT(EPOCH FROM (NEW.recorded_at - prev_point.recorded_at));
            NEW.time_spent := LEAST(ROUND(calculated_time_spent::numeric, 2), 9999999999.99);

            IF calculated_time_spent > 0 THEN
                computed_speed := calculated_distance / calculated_time_spent;
                NEW.speed := LEAST(ROUND(computed_speed::numeric, 2), 9999999999.99);
            ELSE
                NEW.speed := 0;
            END IF;
        ELSE
            NEW.distance := 0;
            NEW.time_spent := 0;
            NEW.speed := 0;
        END IF;

        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


