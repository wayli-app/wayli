-- @fluxbase:description Get a rich summary of one trip, combining trip metadata, the place visits made during it (grouped by category), and the user's journal entries for the trip. Use for "summarize my X trip", "recap my trip", "tell me about my X trip", "what did I do on my X trip". Resolves the trip by trip_id (preferred) or fuzzy trip_title. Returns a single JSON object so the supervisor can narrate from one tool result instead of fanning out to my_trips + visits-for-trip + search-journal-entries.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "trip_id?": "uuid", "trip_title?": "text" }
-- @fluxbase:allowed-tables my_trips, my_trip_entries, my_place_visits
-- @fluxbase:max-execution-time 30s

-- ponytail: trips, place_visits and trip_entries all share only user_id
-- (RLS-scoped via the my_* views); place_visits has no FK to trips. We resolve
-- the trip once via a LEFT JOIN LATERAL off a single seed row (a named CTE
-- trips the table-allowlist validator). When no trip resolves, tw.* is NULL and
-- every aggregate is guarded by `tw.id IS NOT NULL`, so we emit {"found": false}
-- instead of an empty result. One invoke_rpc call gives the supervisor
-- everything it needs for a trip recap — including the user's own written
-- memories, which is what makes a summary feel personal.
SELECT COALESCE(
    jsonb_build_object(
        'found', (tw.id IS NOT NULL),
        'trip', CASE WHEN tw.id IS NOT NULL THEN jsonb_build_object(
            'id', tw.id,
            'title', tw.title,
            'description', tw.description,
            'start_date', tw.start_date,
            'end_date', tw.end_date,
            'trip_days', tw.trip_days,
            'data_points', tw.data_points,
            'primary_city', tw.primary_city,
            'primary_country_code', tw.primary_country_code,
            'visited_cities', tw.visited_cities,
            'visited_country_codes', tw.visited_country_codes,
            'distance_traveled_m', tw.distance_traveled
        ) ELSE NULL END,
        'visits_by_category', COALESCE((
            SELECT jsonb_agg(cat_row ORDER BY (cat_row->>'visit_count')::int DESC)
            FROM (
                SELECT jsonb_build_object(
                    'category', v.poi_category,
                    'visit_count', COUNT(*),
                    'total_minutes', COALESCE(SUM(v.duration_minutes), 0),
                    'top_places', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object('name', n.poi_name, 'visits', n.c) ORDER BY n.c DESC)
                        FROM (
                            SELECT v2.poi_name, COUNT(*) AS c
                            FROM my_place_visits v2
                            WHERE v2.started_at >= tw.start_date::timestamptz
                              AND v2.started_at < (tw.end_date + INTERVAL '1 day')::timestamptz
                              AND v2.poi_category IS NOT DISTINCT FROM v.poi_category
                              AND v2.poi_name IS NOT NULL
                            GROUP BY v2.poi_name
                            LIMIT 3
                        ) n
                    ), '[]'::jsonb)
                ) AS cat_row
                FROM my_place_visits v
                WHERE tw.id IS NOT NULL
                  AND v.started_at >= tw.start_date::timestamptz
                  AND v.started_at < (tw.end_date + INTERVAL '1 day')::timestamptz
                GROUP BY v.poi_category
            ) s
        ), '[]'::jsonb),
        'total_visits', COALESCE((
            SELECT COUNT(*)
            FROM my_place_visits v
            WHERE tw.id IS NOT NULL
              AND v.started_at >= tw.start_date::timestamptz
              AND v.started_at < (tw.end_date + INTERVAL '1 day')::timestamptz
        ), 0),
        'journal_entries', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'title', e.title,
                'body', e.body,
                'entry_date', e.entry_date,
                'end_date', e.end_date
            ) ORDER BY e.entry_date ASC)
            FROM my_trip_entries e
            WHERE tw.id IS NOT NULL
              AND e.trip_id = tw.id
              AND e.body IS NOT NULL
              AND length(e.body) > 0
        ), '[]'::jsonb)
    ),
    '{"found": false}'::jsonb
) AS result
FROM (SELECT 1 AS _) seed
LEFT JOIN LATERAL (
    -- Resolve the trip once: trip_id wins, else fuzzy trip_title (most recent).
    SELECT t.id, t.title, t.description, t.start_date, t.end_date,
           t.trip_days, t.data_points, t.primary_city, t.primary_country_code,
           t.visited_cities, t.visited_country_codes,
           (t.metadata ->> 'distanceTraveled')::numeric AS distance_traveled
    FROM my_trips t
    WHERE
        ($trip_id::uuid IS NOT NULL AND t.id = $trip_id::uuid)
        OR (
            $trip_id::uuid IS NULL
            AND $trip_title::text IS NOT NULL
            AND $trip_title::text <> ''
            AND t.title ILIKE '%' || $trip_title::text || '%'
        )
    ORDER BY t.start_date DESC
    LIMIT 1
) tw ON true;
