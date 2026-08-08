-- @fluxbase:description Search the user's trip journal entries (blog posts) by trip id, trip title, free text, or date range. Returns entry titles, dates, and full body. Use for questions about past experiences or written memories. Prefer trip_id for a specific trip (exact match); use trip_title for fuzzy/keyword matching.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "trip_id?": "uuid", "trip_title?": "text", "search_text?": "text", "date_range?": "text", "limit?": "integer" }
-- @fluxbase:allowed-tables my_trip_entries
-- @fluxbase:max-execution-time 30s

-- ponytail: type casts on every $xxx IS NULL/IS NOT NULL so Postgres can
-- infer param types when the caller sends NULL.
SELECT
    id,
    trip_id,
    trip_title,
    title,
    body,
    entry_date,
    end_date,
    trip_start,
    trip_end,
    trip_image_url
FROM my_trip_entries
WHERE body IS NOT NULL
  AND length(body) > 0
  AND ($trip_id::uuid IS NULL OR trip_id = $trip_id::uuid)
  AND ($trip_title::text IS NULL OR trip_title ILIKE '%' || $trip_title::text || '%')
  AND ($search_text::text IS NULL OR title ILIKE '%' || $search_text::text || '%' OR body ILIKE '%' || $search_text::text || '%')
  AND (
    $date_range::text IS NULL OR
    CASE
      WHEN lower($date_range::text) LIKE '%this year%' THEN entry_date >= DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last year%' THEN entry_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                                            AND entry_date < DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%this month%' THEN entry_date >= DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last month%' THEN entry_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                                              AND entry_date < DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%30 days%' THEN entry_date >= CURRENT_DATE - INTERVAL '30 days'
      WHEN lower($date_range::text) LIKE '%7 days%' OR lower($date_range::text) LIKE '%past week%' THEN entry_date >= CURRENT_DATE - INTERVAL '7 days'
      WHEN lower($date_range::text) LIKE '%today%' THEN entry_date >= CURRENT_DATE
      ELSE TRUE
    END
  )
ORDER BY entry_date DESC
LIMIT GREATEST(1, LEAST(COALESCE($limit::integer, 5), 20));
