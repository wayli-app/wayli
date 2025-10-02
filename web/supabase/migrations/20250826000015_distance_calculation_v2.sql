-- Distance Calculation V2: Chronological Batch Processing
--
-- PROBLEM WITH PREVIOUS APPROACH:
-- - Used LAG() window function with LIMIT
-- - LAG() couldn't see previous records outside the limited batch
-- - Result: Only 4-5 records updated per batch, inaccurate progress
--
-- NEW APPROACH:
-- - Process ALL records in chronological order using offset-based batching
-- - Use LATERAL join to get previous record (no window functions)
-- - Accurate progress tracking
-- - Guaranteed to process all records

CREATE OR REPLACE FUNCTION calculate_distances_batch_v2(
    p_user_id UUID,
    p_offset INTEGER,
    p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    -- Set timeout for batch processing
    SET statement_timeout = '30s';

    -- Get batch of records in chronological order
    WITH batch AS (
        SELECT user_id, recorded_at, location
        FROM public.tracker_data
        WHERE user_id = p_user_id
          AND location IS NOT NULL
        ORDER BY recorded_at
        OFFSET p_offset
        LIMIT p_limit
    ),
    -- Calculate distances using LATERAL join to get previous record
    -- This approach is reliable because it always looks at the actual previous record
    -- in the database, not just within a limited result set
    calculations AS (
        SELECT
            b.user_id,
            b.recorded_at,
            COALESCE(
                public.st_distancesphere(prev.location, b.location),
                0
            ) AS distance,
            COALESCE(
                EXTRACT(EPOCH FROM (b.recorded_at - prev.recorded_at)),
                0
            ) AS time_spent
        FROM batch b
        LEFT JOIN LATERAL (
            -- Find the actual previous record for this user
            -- This works because we're not limiting the search to the batch
            SELECT location, recorded_at
            FROM public.tracker_data
            WHERE user_id = b.user_id
              AND recorded_at < b.recorded_at
              AND location IS NOT NULL
            ORDER BY recorded_at DESC
            LIMIT 1
        ) prev ON true
    )
    -- Update the records in this batch using composite primary key
    UPDATE public.tracker_data t
    SET
        distance = LEAST(ROUND(c.distance::numeric, 2), 9999999999.99),
        time_spent = LEAST(ROUND(c.time_spent::numeric, 2), 9999999999.99),
        speed = LEAST(ROUND(
            (CASE WHEN c.time_spent > 0
             THEN (c.distance / c.time_spent) * 3.6  -- Convert m/s to km/h
             ELSE 0
             END)::numeric,
            2
        ), 9999999999.99),
        updated_at = NOW()
    FROM calculations c
    WHERE t.user_id = c.user_id
      AND t.recorded_at = c.recorded_at;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION calculate_distances_batch_v2 IS 'V2 distance calculation using chronological batch processing with offset. Processes records in order to ensure each record can find its previous record. Returns number of records updated.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_distances_batch_v2(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_distances_batch_v2(UUID, INTEGER, INTEGER) TO service_role;
