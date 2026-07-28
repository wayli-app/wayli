-- @fluxbase:description Aggregate statistics about place visits: total time, visit counts, or average duration. Group by POI name, category, city, or country. Supports country/city/category/date filters.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "metric": "text", "group_by": "text", "country?": "text", "city?": "text", "category?": "text", "date_range?": "text", "limit?": "integer" }
-- @fluxbase:allowed-tables my_place_visits, country_name_aliases
-- @fluxbase:max-execution-time 30s

-- ponytail: metric/group_by validated inline via CASE. Invalid → NULL group_value, no rows.
-- Type casts on every $xxx IS NULL/IS NOT NULL so Postgres can infer param types
-- even when the caller sends NULL (PR #256 + Wayli single-line input workaround).
SELECT
    CASE $group_by
        WHEN 'poi_name' THEN pv.poi_name
        WHEN 'poi_category' THEN pv.poi_category
        WHEN 'city' THEN pv.city
        WHEN 'country_code' THEN pv.country_code
        ELSE NULL
    END AS group_value,
    CASE $metric
        WHEN 'total_time' THEN SUM(pv.duration_minutes)
        WHEN 'visit_count' THEN COUNT(*)
        WHEN 'avg_duration' THEN ROUND(AVG(pv.duration_minutes))
    END AS metric_value,
    CASE $metric
        WHEN 'total_time' THEN 'total_minutes'
        WHEN 'visit_count' THEN 'visit_count'
        WHEN 'avg_duration' THEN 'avg_minutes'
    END AS metric_alias,
    COUNT(*) AS total_visits,
    MIN(pv.started_at) AS first_visit,
    MAX(pv.started_at) AS last_visit
FROM my_place_visits pv
WHERE $metric IN ('total_time', 'visit_count', 'avg_duration')
  AND $group_by IN ('poi_name', 'poi_category', 'city', 'country_code')
  AND ($country::text IS NULL OR pv.country_code = resolve_country_code($country::text))
  AND ($city::text IS NULL OR pv.city ILIKE '%' || $city::text || '%')
  AND ($category::text IS NULL OR pv.poi_category = $category::text)
  AND (
    $date_range::text IS NULL OR
    CASE
      WHEN lower($date_range::text) LIKE '%this year%' THEN pv.started_at >= DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last year%' THEN pv.started_at >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                                              AND pv.started_at < DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%this month%' THEN pv.started_at >= DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last month%' THEN pv.started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                                              AND pv.started_at < DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%30 days%' THEN pv.started_at >= CURRENT_DATE - INTERVAL '30 days'
      WHEN lower($date_range::text) LIKE '%7 days%' OR lower($date_range::text) LIKE '%past week%' THEN pv.started_at >= CURRENT_DATE - INTERVAL '7 days'
      WHEN lower($date_range::text) LIKE '%today%' THEN pv.started_at >= CURRENT_DATE
      ELSE TRUE
    END
  )
GROUP BY
    CASE $group_by
        WHEN 'poi_name' THEN pv.poi_name
        WHEN 'poi_category' THEN pv.poi_category
        WHEN 'city' THEN pv.city
        WHEN 'country_code' THEN pv.country_code
    END,
    $metric
HAVING CASE $metric
    WHEN 'total_time' THEN SUM(pv.duration_minutes) IS NOT NULL
    WHEN 'visit_count' THEN COUNT(*) IS NOT NULL
    WHEN 'avg_duration' THEN ROUND(AVG(pv.duration_minutes)) IS NOT NULL
END
ORDER BY metric_value DESC NULLS LAST
LIMIT GREATEST(1, LEAST(COALESCE($limit::integer, 10), 50));
