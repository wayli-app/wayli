-- @fluxbase:description Aggregate tracker_data into per-day distance/time/point-count for the activity calendar. Returns one row per day (only days with data), ordered oldest→newest. Reads from the cached tracker_daily_activity table (refreshed by the refresh-daily-activity job). If the cache is empty, returns an empty set (the frontend shows a placeholder with a refresh button).
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "days?": "integer" }
-- @fluxbase:allowed-tables tracker_daily_activity
-- @fluxbase:max-execution-time 5s

-- Read directly from the cached daily-activity table. The refresh-daily-activity
-- job populates this incrementally. No live fallback (the live aggregation over
-- 75k+ rows times out — that's why the cache table exists). If the cache is
-- empty for this user, the frontend shows a "Build activity data" button.
SELECT
    day::text AS day,
    distance::float8 AS distance,
    time_spent::float8 AS time_spent,
    points::integer AS points
FROM public.tracker_daily_activity
WHERE user_id = auth.uid()
  AND day >= CURRENT_DATE - COALESCE($days::integer, 371)
ORDER BY day ASC;
