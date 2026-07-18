-- @fluxbase:name search_journal_entries
-- @fluxbase:description Search the user's trip journal entries (blog posts) by trip title, free text, or date range. Returns entry titles, dates, and full body. Use for questions about past experiences or written memories.
-- @fluxbase:require-role authenticated
-- @fluxbase:input {
--   "trip_title?": "text",
--   "search_text?": "text",
--   "date_range?": "text",
--   "limit?": "integer"
-- }
-- @fluxbase:allowed-tables my_trip_entries
-- @fluxbase:max-execution-time 30s

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
  AND ($trip_title IS NULL OR trip_title ILIKE '%' || $trip_title || '%')
  AND ($search_text IS NULL OR title ILIKE '%' || $search_text || '%' OR body ILIKE '%' || $search_text || '%')
  AND (
    $date_range IS NULL OR
    CASE
      WHEN lower($date_range) LIKE '%this year%' THEN entry_date >= DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%last year%' THEN entry_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                                            AND entry_date < DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%this month%' THEN entry_date >= DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%last month%' THEN entry_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                                              AND entry_date < DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range) LIKE '%30 days%' THEN entry_date >= CURRENT_DATE - INTERVAL '30 days'
      WHEN lower($date_range) LIKE '%7 days%' OR lower($date_range) LIKE '%past week%' THEN entry_date >= CURRENT_DATE - INTERVAL '7 days'
      WHEN lower($date_range) LIKE '%today%' THEN entry_date >= CURRENT_DATE
      ELSE TRUE
    END
  )
ORDER BY entry_date DESC
LIMIT GREATEST(1, LEAST(COALESCE($limit, 5), 20));
