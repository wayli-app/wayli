-- @fluxbase:name activity_calendar
-- @fluxbase:description Aggregate tracker_data into per-day distance/time/point-count for the activity calendar. Returns one row per day in the trailing window (default 371 days = 53 weeks), ordered oldest→newest. Use for the GitHub-style activity heatmap so the client doesn't have to fetch every raw point.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "days?": "integer" }
-- @fluxbase:allowed-tables tracker_data
-- @fluxbase:max-execution-time 15s

-- Aggregate per local calendar day. We bucket by the day part of recorded_at
-- converted to the user's wall-clock via AT TIME ZONE 'UTC' (tracker_data
-- timestamps are UTC). distance/time_spent are summed per day; point_count is
-- the number of fixes that day. Only rows with a location are counted (matches
-- the page's own filter). Scoped to the current user via auth.uid() (RLS also
-- enforces this).
SELECT
    (recorded_at AT TIME ZONE 'UTC')::date::text AS day,
    COALESCE(SUM(distance), 0)::float8 AS distance,
    COALESCE(SUM(time_spent), 0)::float8 AS time_spent,
    COUNT(*)::integer AS points
FROM public.tracker_data
WHERE user_id = auth.uid()
  AND location IS NOT NULL
  AND recorded_at >= NOW() - CONCAT(COALESCE($days::integer, 371)::text, ' days')::interval
GROUP BY 1
ORDER BY 1 ASC;
