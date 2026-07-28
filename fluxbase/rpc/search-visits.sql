-- @fluxbase:description Search place visits with smart filtering. Converts country names to ISO codes, fuzzy matches cities/amenities, parses natural-language date ranges. Returns visits ordered by recency.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "country?": "text", "city?": "text", "category?": "text", "amenity?": "text", "cuisine?": "text", "date_range?": "text", "limit?": "integer" }
-- @fluxbase:allowed-tables my_place_visits, country_name_aliases
-- @fluxbase:max-execution-time 30s

-- ponytail: type casts on every $xxx IS NULL/IS NOT NULL — Postgres can't
-- infer the type from a NULL comparison alone, so without ::text etc. we
-- get SQLSTATE 42P08 ("could not determine data type of parameter $1").
SELECT
    poi_name,
    poi_amenity,
    poi_cuisine,
    poi_category,
    city,
    country_code,
    started_at,
    duration_minutes,
    latitude,
    longitude
FROM my_place_visits
WHERE ($country::text IS NULL OR country_code = resolve_country_code($country::text))
  AND ($city::text IS NULL OR city ILIKE '%' || $city::text || '%')
  AND ($category::text IS NULL OR poi_category = $category::text)
  AND ($amenity::text IS NULL OR poi_amenity ILIKE '%' || $amenity::text || '%')
  AND (
    $cuisine::text IS NULL OR
    poi_cuisine ILIKE '%' || $cuisine::text || '%' OR
    poi_tags->'osm'->>('diet:' || replace(replace(lower($cuisine::text), ' ', ':'), '-', ':')) = 'yes' OR
    poi_name ILIKE '%' || $cuisine::text || '%'
  )
  AND (
    $date_range::text IS NULL OR
    CASE
      WHEN lower($date_range::text) LIKE '%this year%' THEN started_at >= DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last year%' THEN started_at >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                                          AND started_at < DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%this month%' THEN started_at >= DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last month%' THEN started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                                              AND started_at < DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%30 days%' THEN started_at >= CURRENT_DATE - INTERVAL '30 days'
      WHEN lower($date_range::text) LIKE '%7 days%' OR lower($date_range::text) LIKE '%past week%' THEN started_at >= CURRENT_DATE - INTERVAL '7 days'
      WHEN lower($date_range::text) LIKE '%today%' THEN started_at >= CURRENT_DATE
      ELSE TRUE
    END
  )
ORDER BY started_at DESC
LIMIT GREATEST(1, LEAST(COALESCE($limit::integer, 20), 50));
