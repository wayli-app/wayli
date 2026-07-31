-- @fluxbase:description Find place visits that occurred DURING a specific trip, by overlapping the trip's date window with visit timestamps. Use for "which restaurant did I visit in Paris?", "what did I do on my Berlin trip?", "where did I eat during my last trip?". Resolves the trip by trip_id (preferred) or fuzzy trip_title, then filters visits by the trip's start/end dates plus optional category/amenity/cuisine/city. This bypasses the NL-only date_range of search-visits and the trips↔place_visits join that raw SQL can't express cleanly.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "trip_id?": "uuid", "trip_title?": "text", "category?": "text", "amenity?": "text", "cuisine?": "text", "city?": "text", "limit?": "integer" }
-- @fluxbase:allowed-tables my_trips, my_place_visits
-- @fluxbase:max-execution-time 30s

-- ponytail: trips and place_visits share only user_id (RLS-scoped via the my_*
-- views); there is no FK between them. We resolve the trip's [start_date,
-- end_date] window from my_trips in a lateral subquery, then filter visits
-- whose started_at falls within it (end_date inclusive: started_at < end_date
-- + 1 day). One server-side call so the assistant makes a single invoke_rpc
-- instead of a fragile two-query dance. (A named CTE trips the table-allowlist
-- validator, so we use a LATERAL join instead.)
SELECT
    v.poi_name,
    v.poi_amenity,
    v.poi_cuisine,
    v.poi_category,
    v.city,
    v.country_code,
    v.started_at,
    v.duration_minutes,
    v.latitude,
    v.longitude,
    tw.title AS trip_title,
    tw.primary_city AS trip_primary_city
FROM my_place_visits v
CROSS JOIN LATERAL (
    -- Resolve the trip's date window. Both params are passed every time (the
    -- validator requires present keys; empty string is fine). trip_id wins.
    SELECT t.start_date, t.end_date, t.title, t.primary_city
    FROM my_trips t
    WHERE
        ($trip_id::uuid IS NOT NULL AND t.id = $trip_id::uuid)
        OR (
            $trip_id::uuid IS NULL
            AND $trip_title::text IS NOT NULL
            AND $trip_title::text <> ''
            AND t.title ILIKE '%' || $trip_title::text || '%'
        )
    ORDER BY
        -- When multiple trips match a fuzzy title, prefer the most recent.
        t.start_date DESC
    LIMIT 1
) tw
WHERE
    -- Date-overlap join: visit falls within the trip window (end inclusive).
    v.started_at >= tw.start_date::timestamptz
    AND v.started_at < (tw.end_date + INTERVAL '1 day')::timestamptz
    AND ($city::text IS NULL OR v.city ILIKE '%' || $city::text || '%')
    AND ($category::text IS NULL OR v.poi_category = $category::text)
    AND ($amenity::text IS NULL OR v.poi_amenity ILIKE '%' || $amenity::text || '%')
    AND (
        $cuisine::text IS NULL
        OR v.poi_cuisine ILIKE '%' || $cuisine::text || '%'
        OR v.poi_tags->'osm'->>('diet:' || replace(replace(lower($cuisine::text), ' ', ':'), '-', ':')) = 'yes'
        OR v.poi_name ILIKE '%' || $cuisine::text || '%'
    )
ORDER BY v.started_at ASC
LIMIT GREATEST(1, LEAST(COALESCE($limit::integer, 50), 100));
