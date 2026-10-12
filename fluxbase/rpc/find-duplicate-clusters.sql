-- @fluxbase:description Find "overlapping recordings": contiguous sections where two different recording sessions (a file import vs the live tracker, a second device, or an earlier import) tracked the same movement. Two points match when they are close in time (default ±180s) AND close in space (default 150m, widened by GPS accuracy); consecutive matches with gaps under 10min are merged into a section. Two modes: pass import_id to compare one freshly-imported file against everything else already recorded, or pass start_date/end_date to scan a window (import-vs-device and device-vs-device pairs only). Returns a jsonb array of sections with per-side counts, median accuracy and duration — no coordinates — for the caller to rank and store as a duplicate report. Returns [] when nothing overlaps.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "import_id?": "text", "start_date?": "text", "end_date?": "text", "time_window_s?": "integer", "distance_m?": "integer", "merge_gap_min?": "integer", "min_pairs?": "integer" }
-- @fluxbase:allowed-tables tracker_data
-- @fluxbase:max-execution-time 1800s

-- ponytail: the pair search is a LATERAL index probe per initiating point —
-- the inner side scans tracker_data directly (single-ref CTEs stay inlined) so
-- idx_tracker_data_user_timestamp_ordered bounds each probe to the ±time
-- window. Never join two materialized CTEs on a time neighbourhood: that
-- degrades to O(n²). Sections never carry coordinates, only counts/stats.
WITH params AS (
    SELECT
        auth.uid() AS uid,
        NULLIF($import_id::text, '') AS import_id,
        $start_date::timestamptz AS start_date,
        $end_date::timestamptz AS end_date,
        COALESCE($time_window_s::integer, 180) AS time_window_s,
        COALESCE($distance_m::integer, 150) AS distance_m,
        COALESCE($merge_gap_min::integer, 10) AS merge_gap_min,
        COALESCE($min_pairs::integer, 8) AS min_pairs
),
bounds AS (
    -- Detection window: the explicit range (scan mode) or the import's own
    -- span ± a pad so edge points can still match points recorded slightly
    -- before/after the file's first/last fix.
    SELECT
        p.*,
        CASE
            WHEN p.import_id IS NOT NULL THEN (
                SELECT min(t.recorded_at) FROM public.tracker_data t
                WHERE t.user_id = p.uid
                  AND t.location IS NOT NULL
                  AND t.geocode->'properties'->>'import_id' = p.import_id
            )
            ELSE p.start_date
        END - (make_interval(secs => p.time_window_s) + make_interval(mins => p.merge_gap_min)) AS win_start,
        CASE
            WHEN p.import_id IS NOT NULL THEN (
                SELECT max(t.recorded_at) FROM public.tracker_data t
                WHERE t.user_id = p.uid
                  AND t.location IS NOT NULL
                  AND t.geocode->'properties'->>'import_id' = p.import_id
            )
            ELSE p.end_date
        END + (make_interval(secs => p.time_window_s) + make_interval(mins => p.merge_gap_min)) AS win_end
    FROM params p
),
-- Initiating side, import mode: only the named import's points.
a_import AS (
    SELECT
        t.recorded_at, t.location, t.accuracy,
        'import:' || (t.geocode->'properties'->>'import_id') AS session_key,
        'import'::text AS session_kind
    FROM public.tracker_data t, bounds b
    WHERE b.import_id IS NOT NULL
      AND t.user_id = b.uid
      AND t.location IS NOT NULL
      AND t.geocode->'properties'->>'import_id' = b.import_id
),
-- Initiating side, scan mode: every import- or device-sessioned point in the
-- window. Legacy imports (imported_at without import_id) and 'other' points
-- (e.g. manual pins) participate only as the matched side in import mode —
-- bucketing an old import run by hour could otherwise section against itself.
a_scan AS (
    SELECT
        t.recorded_at, t.location, t.accuracy,
        CASE
            WHEN t.geocode->'properties'->>'import_id' IS NOT NULL
                THEN 'import:' || (t.geocode->'properties'->>'import_id')
            WHEN t.device_id IS NOT NULL
                THEN 'device:' || t.device_id
        END AS session_key,
        CASE
            WHEN t.geocode->'properties'->>'import_id' IS NOT NULL THEN 'import'
            WHEN t.device_id IS NOT NULL THEN 'device'
        END AS session_kind
    FROM public.tracker_data t, bounds b
    WHERE b.import_id IS NULL
      AND b.win_start IS NOT NULL
      AND t.user_id = b.uid
      AND t.location IS NOT NULL
      AND t.recorded_at BETWEEN b.win_start AND b.win_end
      AND (
          t.geocode->'properties'->>'import_id' IS NOT NULL
          OR t.device_id IS NOT NULL
      )
),
pairs AS (
    -- Import mode: the new file against every other session (device feed,
    -- earlier imports, legacy imports). Sessions are bucketed so per-side
    -- stats and victim selection at apply time are anchored to one stream.
    SELECT
        a.session_key AS key_a,
        m.b_key AS key_b,
        a.recorded_at AS ts_a,
        m.b_ts AS ts_b,
        a.accuracy AS acc_a,
        m.b_acc AS acc_b
    FROM a_import a, bounds b
    JOIN LATERAL (
        SELECT
            CASE
                WHEN u.geocode->'properties'->>'import_id' IS NOT NULL
                    THEN 'import:' || (u.geocode->'properties'->>'import_id')
                WHEN u.geocode->'properties'->>'imported_at' IS NOT NULL
                    THEN 'legacy:' || substr(u.geocode->'properties'->>'imported_at', 1, 13)
                WHEN u.device_id IS NOT NULL
                    THEN 'device:' || u.device_id
                ELSE 'other:' || COALESCE(u.tracker_type, 'unknown')
            END AS b_key,
            u.recorded_at AS b_ts,
            u.accuracy AS b_acc,
            u.location
        FROM public.tracker_data u, bounds b2
        WHERE b2.import_id IS NOT NULL
          AND u.user_id = b2.uid
          AND u.location IS NOT NULL
          AND u.recorded_at BETWEEN a.recorded_at - make_interval(secs => b2.time_window_s)
                               AND a.recorded_at + make_interval(secs => b2.time_window_s)
    ) m ON m.b_key <> a.session_key
    WHERE b.import_id IS NOT NULL
      AND st_distancesphere(m.location, a.location)
          <= GREATEST(
              b.distance_m,
              LEAST(COALESCE(m.b_acc, 0) + COALESCE(a.accuracy, 0), 500)
          )

    UNION ALL

    -- Scan mode: import-vs-device and device-vs-device pairs only, each
    -- unordered pair initiated exactly once (from the smaller session key).
    SELECT
        a.session_key AS key_a,
        m.b_key AS key_b,
        a.recorded_at AS ts_a,
        m.b_ts AS ts_b,
        a.accuracy AS acc_a,
        m.b_acc AS acc_b
    FROM a_scan a, bounds b
    JOIN LATERAL (
        SELECT
            CASE
                WHEN u.geocode->'properties'->>'import_id' IS NOT NULL
                    THEN 'import:' || (u.geocode->'properties'->>'import_id')
                WHEN u.device_id IS NOT NULL
                    THEN 'device:' || u.device_id
            END AS b_key,
            CASE
                WHEN u.geocode->'properties'->>'import_id' IS NOT NULL THEN 'import'
                WHEN u.device_id IS NOT NULL THEN 'device'
            END AS b_kind,
            u.recorded_at AS b_ts,
            u.accuracy AS b_acc,
            u.location
        FROM public.tracker_data u, bounds b2
        WHERE b2.import_id IS NULL
          AND u.user_id = b2.uid
          AND u.location IS NOT NULL
          AND u.recorded_at BETWEEN a.recorded_at - make_interval(secs => b2.time_window_s)
                               AND a.recorded_at + make_interval(secs => b2.time_window_s)
          AND (
              u.geocode->'properties'->>'import_id' IS NOT NULL
              OR u.device_id IS NOT NULL
          )
    ) m ON m.b_key > a.session_key
    WHERE b.import_id IS NULL
      AND (
          (a.session_kind = 'device' AND m.b_kind IN ('device', 'import'))
          OR (a.session_kind = 'import' AND m.b_kind = 'device')
      )
      AND st_distancesphere(m.location, a.location)
          <= GREATEST(
              b.distance_m,
              LEAST(COALESCE(m.b_acc, 0) + COALESCE(a.accuracy, 0), 500)
          )
),
pair_ints AS (
    SELECT
        p.key_a, p.key_b, p.ts_a, p.ts_b, p.acc_a, p.acc_b,
        least(p.ts_a, p.ts_b) AS lo,
        greatest(p.ts_a, p.ts_b) AS hi
    FROM pairs p
),
-- Gaps-and-islands: consecutive matches (gap <= merge gap) form one section.
islands AS (
    SELECT
        s.*,
        SUM(s.step) OVER (
            PARTITION BY s.key_a, s.key_b ORDER BY s.lo, s.hi
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS island_no
    FROM (
        SELECT
            pi.*,
            CASE
                WHEN pi.lo - LAG(pi.hi) OVER (
                    PARTITION BY pi.key_a, pi.key_b ORDER BY pi.lo, pi.hi
                ) <= (SELECT merge_gap_min FROM params) * interval '1 min'
                THEN 0 ELSE 1
            END AS step
        FROM pair_ints pi
    ) s
),
clusters AS (
    SELECT
        i.key_a, i.key_b, i.island_no,
        min(i.lo) AS start_ts,
        max(i.hi) AS end_ts,
        count(*) AS pair_count,
        count(DISTINCT i.ts_a) AS count_a,
        count(DISTINCT i.ts_b) AS count_b,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY i.acc_a) AS median_acc_a,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY i.acc_b) AS median_acc_b
    FROM islands i
    GROUP BY i.key_a, i.key_b, i.island_no
    HAVING count(*) >= (SELECT min_pairs FROM params)
)
SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.start_ts), '[]'::jsonb)
FROM (
    SELECT
        c.key_a, c.key_b, c.start_ts, c.end_ts, c.pair_count,
        c.count_a, c.count_b, c.median_acc_a, c.median_acc_b,
        EXTRACT(EPOCH FROM (c.end_ts - c.start_ts))::integer AS duration_s
    FROM clusters c
) c;
