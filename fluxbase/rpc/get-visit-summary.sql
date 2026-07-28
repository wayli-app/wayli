-- @fluxbase:description Get summary statistics for a specific POI name or category. Returns visit count, total/average duration, first/last visit timestamps, top cities, and top POIs.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "poi_name?": "text", "category?": "text" }
-- @fluxbase:allowed-tables my_place_visits
-- @fluxbase:max-execution-time 30s

-- Returns a single JSON blob combining summary + top_cities + top_pois so the
-- supervisor can read it as one tool result instead of three queries.
WITH summary AS (
    SELECT
        COUNT(*) AS visit_count,
        COALESCE(SUM(duration_minutes), 0) AS total_minutes,
        ROUND(AVG(duration_minutes)) AS avg_minutes,
        MIN(started_at) AS first_visit,
        MAX(started_at) AS last_visit
    FROM my_place_visits
    WHERE ($poi_name::text IS NULL OR poi_name ILIKE '%' || $poi_name::text || '%')
      AND ($category::text IS NULL OR poi_category = $category::text)
),
top_cities AS (
    SELECT city, country_code, COUNT(*) AS visits
    FROM my_place_visits
    WHERE ($poi_name::text IS NULL OR poi_name ILIKE '%' || $poi_name::text || '%')
      AND ($category::text IS NULL OR poi_category = $category::text)
      AND city IS NOT NULL
    GROUP BY city, country_code
    ORDER BY visits DESC
    LIMIT 5
),
top_pois AS (
    SELECT poi_name, poi_amenity, COUNT(*) AS visits, SUM(duration_minutes) AS total_minutes
    FROM my_place_visits
    WHERE ($poi_name::text IS NULL OR poi_name ILIKE '%' || $poi_name::text || '%')
      AND ($category::text IS NULL OR poi_category = $category::text)
      AND poi_name IS NOT NULL
    GROUP BY poi_name, poi_amenity
    ORDER BY visits DESC
    LIMIT 10
)
SELECT jsonb_build_object(
    'summary', (SELECT to_jsonb(s) FROM summary s),
    'top_cities', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM top_cities c), '[]'::jsonb),
    'top_pois',   COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM top_pois p),   '[]'::jsonb)
) AS result;
