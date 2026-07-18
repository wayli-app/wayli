-- @fluxbase:name search_visits
-- @fluxbase:description Search place visits with smart filtering. Converts country names to ISO codes, fuzzy matches cities/amenities, parses natural-language date ranges. Returns visits ordered by recency.
-- @fluxbase:require-role authenticated
-- @fluxbase:input {
--   "country?": "text",
--   "city?": "text",
--   "category?": "text",
--   "amenity?": "text",
--   "cuisine?": "text",
--   "date_range?": "text",
--   "limit?": "integer"
-- }
-- @fluxbase:allowed-tables my_place_visits, country_name_aliases
-- @fluxbase:max-execution-time 30s

-- ponytail: date_range natural-language parsing inlined as a CASE.
-- Supported: this year, last year, this month, last month, last/past 30 days,
-- last 7 days / past week, today. Anything else → no date filter.
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
WHERE ($country IS NULL OR country_code = resolve_country_code($country))
  AND ($city IS NULL OR city ILIKE '%' || $city || '%')
  AND ($category IS NULL OR poi_category = $category)
  AND ($amenity IS NULL OR poi_amenity ILIKE '%' || $amenity || '%')
  AND (
    $cuisine IS NULL OR
    poi_cuisine ILIKE '%' || $cuisine || '%' OR
    poi_tags->'osm'->>('diet:' || replace(replace(lower($cuisine), ' ', ':'), '-', ':')) = 'yes' OR
    poi_name ILIKE '%' || $cuisine || '%'
  )
  AND (
    $date_range IS NULL OR
    CASE
      WHEN lower($date_range) LIKE '%this year%' THEN started_at >= DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%last year%' THEN started_at >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                                          AND started_at < DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%this month%' THEN started_at >= DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%last month%' THEN started_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                                              AND started_at < DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%30 days%' THEN started_at >= CURRENT_DATE - INTERVAL '30 days'
      WHEN lower($date_range) LIKE '%7 days%' OR lower($date_range) LIKE '%past week%' THEN started_at >= CURRENT_DATE - INTERVAL '7 days'
      WHEN lower($date_range) LIKE '%today%' THEN started_at >= CURRENT_DATE
      ELSE TRUE
    END
  )
ORDER BY started_at DESC
LIMIT GREATEST(1, LEAST(COALESCE($limit, 20), 50));
