-- @fluxbase:description Return the recorded_at timestamps of one recording session's points that duplicate another session's points inside a time window — the exact delete set for an approved duplicate-report section. Both sessions are addressed by their session key (as emitted by find-duplicate-clusters: 'import:<uuid>' / 'device:<id>' / 'legacy:<bucket>'); the losing side's points qualify when a kept-side point exists within ±time_window_s AND within a GPS-accuracy-aware distance. Manual points are never returned. Caller-scoped via RLS.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "keeper_key": "text", "loser_key": "text", "window_start": "text", "window_end": "text", "time_window_s?": "integer", "distance_m?": "integer" }
-- @fluxbase:allowed-tables tracker_data
-- @fluxbase:max-execution-time 1800s

-- Session keys are parsed back to raw predicates so the keeper lookup can use
-- the (user_id, recorded_at) index; manual points are hard-excluded from the
-- delete set no matter which side lost.
WITH bounds AS (
    SELECT
        auth.uid() AS uid,
        $keeper_key::text AS keeper_key,
        $loser_key::text AS loser_key,
        $window_start::timestamptz - (make_interval(secs => COALESCE($time_window_s::integer, 180))) AS win_start,
        $window_end::timestamptz + (make_interval(secs => COALESCE($time_window_s::integer, 180))) AS win_end,
        COALESCE($time_window_s::integer, 180) AS time_window_s,
        COALESCE($distance_m::integer, 150) AS distance_m
)
SELECT COALESCE(jsonb_agg(v.recorded_at ORDER BY v.recorded_at), '[]'::jsonb)
FROM (
    SELECT l.recorded_at
    FROM public.tracker_data l, bounds b
    WHERE l.user_id = b.uid
      AND l.location IS NOT NULL
      AND l.tracker_type IS DISTINCT FROM 'manual'
      AND l.recorded_at BETWEEN b.win_start AND b.win_end
      AND (
          CASE
              WHEN l.geocode->'properties'->>'import_id' IS NOT NULL
                  THEN 'import:' || (l.geocode->'properties'->>'import_id')
              WHEN l.geocode->'properties'->>'imported_at' IS NOT NULL
                  THEN 'legacy:' || substr(l.geocode->'properties'->>'imported_at', 1, 13)
              WHEN l.device_id IS NOT NULL
                  THEN 'device:' || l.device_id
              ELSE 'other:' || COALESCE(l.tracker_type, 'unknown')
          END
      ) = b.loser_key
      AND EXISTS (
          SELECT 1
          FROM public.tracker_data k
          WHERE k.user_id = b.uid
            AND k.location IS NOT NULL
            AND k.recorded_at BETWEEN l.recorded_at - make_interval(secs => b.time_window_s)
                                 AND l.recorded_at + make_interval(secs => b.time_window_s)
            AND (
                CASE
                    WHEN k.geocode->'properties'->>'import_id' IS NOT NULL
                        THEN 'import:' || (k.geocode->'properties'->>'import_id')
                    WHEN k.geocode->'properties'->>'imported_at' IS NOT NULL
                        THEN 'legacy:' || substr(k.geocode->'properties'->>'imported_at', 1, 13)
                    WHEN k.device_id IS NOT NULL
                        THEN 'device:' || k.device_id
                    ELSE 'other:' || COALESCE(k.tracker_type, 'unknown')
                END
            ) = b.keeper_key
            AND st_distancesphere(k.location, l.location)
                <= GREATEST(
                    b.distance_m,
                    LEAST(COALESCE(k.accuracy, 0) + COALESCE(l.accuracy, 0), 500)
                )
      )
) v;
