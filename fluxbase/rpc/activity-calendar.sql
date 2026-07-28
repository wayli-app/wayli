-- @fluxbase:name activity_calendar
-- @fluxbase:description Aggregate tracker_data into per-day distance/time/point-count for the activity calendar. Returns one row per day in the trailing window (default 371 days = 53 weeks), ordered oldest→newest. Reads from the cached tracker_daily_activity table (fast); falls back to live aggregation if the cache is empty.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "days?": "integer" }
-- @fluxbase:allowed-tables tracker_daily_activity, tracker_data
-- @fluxbase:max-execution-time 30s

-- ponytail: the RPC tries the cached aggregation table first (sub-10ms indexed
-- read). If the cache is empty for this user (job hasn't run yet), it falls
-- back to the live aggregation over tracker_data. This ensures the calendar
-- works immediately on first deploy while the cache warms up.
WITH params AS (
    SELECT COALESCE($days::integer, 371) AS num_days,
           auth.uid() AS uid
),
-- Try the cache first.
cached AS (
    SELECT
        day::text AS day,
        distance::float8 AS distance,
        time_spent::float8 AS time_spent,
        points::integer AS points
    FROM public.tracker_daily_activity, params
    WHERE user_id = params.uid
      AND day >= CURRENT_DATE - params.num_days
    ORDER BY day ASC
),
-- Live fallback: aggregate tracker_data directly (same logic the job uses).
live AS (
    SELECT
        (recorded_at AT TIME ZONE 'UTC')::date::text AS day,
        COALESCE(SUM(distance), 0)::float8 AS distance,
        COALESCE(SUM(time_spent), 0)::float8 AS time_spent,
        COUNT(*)::integer AS points
    FROM public.tracker_data, params
    WHERE user_id = params.uid
      AND location IS NOT NULL
      AND recorded_at >= NOW() - make_interval(days => params.num_days)
    GROUP BY 1
    ORDER BY 1 ASC
)
-- Use the cache if it has data; otherwise the live aggregation.
SELECT * FROM cached
WHERE EXISTS (SELECT 1 FROM cached)
UNION ALL
SELECT * FROM live
WHERE NOT EXISTS (SELECT 1 FROM cached);
