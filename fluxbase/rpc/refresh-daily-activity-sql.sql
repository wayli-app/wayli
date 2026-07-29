-- @fluxbase:description Refresh the tracker_daily_activity cache for the current user. Runs a single INSERT...SELECT GROUP BY that aggregates ALL of the user's tracker_data into per-day distance/time/points. Upserts into the cache table and advances the watermark. Returns the number of days upserted.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "user_id?": "text" }
-- @fluxbase:allowed-tables tracker_data, tracker_daily_activity, tracker_daily_activity_state
-- @fluxbase:max-execution-time 120s

-- Step 1: Upsert all per-day aggregates for the user.
WITH aggregated AS (
    SELECT
        auth.uid() AS user_id,
        (recorded_at AT TIME ZONE 'UTC')::date AS day,
        COALESCE(SUM(distance), 0) AS distance,
        COALESCE(SUM(time_spent), 0) AS time_spent,
        COUNT(*)::integer AS points
    FROM public.tracker_data
    WHERE user_id = auth.uid()
      AND location IS NOT NULL
    GROUP BY 1, 2
),
upserted AS (
    INSERT INTO public.tracker_daily_activity (user_id, day, distance, time_spent, points, updated_at)
    SELECT user_id, day, distance, time_spent, points, NOW()
    FROM aggregated
    ON CONFLICT (user_id, day) DO UPDATE SET
        distance = EXCLUDED.distance,
        time_spent = EXCLUDED.time_spent,
        points = EXCLUDED.points,
        updated_at = NOW()
    RETURNING 1
),
-- Step 2: Advance the watermark.
state_upsert AS (
    INSERT INTO public.tracker_daily_activity_state (user_id, last_processed_at, updated_at)
    VALUES (auth.uid(), NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        last_processed_at = NOW(),
        updated_at = NOW()
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM upserted)::integer AS days_upserted,
    (SELECT COUNT(*) FROM state_upsert)::integer AS state_updated;
