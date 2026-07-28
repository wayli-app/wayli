-- @fluxbase:description Search published feed posts (from public trips and trips shared with you, plus your own) by author, trip, free text, or date range. Use for questions about the feed / community stories / what others have posted. Returns author, trip title, post title, date, and body.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "author?": "text", "trip_title?": "text", "search_text?": "text", "date_range?": "text", "limit?": "integer" }
-- @fluxbase:allowed-tables public_trip_entries,public_profiles
-- @fluxbase:max-execution-time 30s

-- Feed posts: published entries visible to the caller (own + public + shared
-- with caller), enriched with the author's display name so the AI can answer
-- "what did X post?" / "what's in my feed about Y?". Mirrors the feed page's
-- enrichment (public_profiles.username / full_name).
SELECT
    pe.id,
    pe.trip_id,
    pe.trip_title,
    pe.title,
    pe.body,
    pe.entry_date,
    pe.end_date,
    pe.trip_image_url,
    pe.trip_visibility,
    COALESCE(pp.full_name, pp.username) AS author_name,
    pp.username AS author_username
FROM public_trip_entries pe
LEFT JOIN public_profiles pp ON pp.id = pe.trip_owner_id
WHERE pe.body IS NOT NULL
  AND length(pe.body) > 0
  AND ($author::text IS NULL
       OR pp.username ILIKE '%' || $author::text || '%'
       OR pp.full_name ILIKE '%' || $author::text || '%')
  AND ($trip_title::text IS NULL OR pe.trip_title ILIKE '%' || $trip_title::text || '%')
  AND ($search_text::text IS NULL
       OR pe.title ILIKE '%' || $search_text::text || '%'
       OR pe.body ILIKE '%' || $search_text::text || '%'
       OR pe.trip_title ILIKE '%' || $search_text::text || '%')
  AND (
    $date_range::text IS NULL OR
    CASE
      WHEN lower($date_range::text) LIKE '%this year%' THEN pe.entry_date >= DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last year%' THEN pe.entry_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1 year')
                                            AND pe.entry_date < DATE_TRUNC('year', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%this month%' THEN pe.entry_date >= DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%last month%' THEN pe.entry_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                                              AND pe.entry_date < DATE_TRUNC('month', CURRENT_DATE)
      WHEN lower($date_range::text) LIKE '%30 days%' THEN pe.entry_date >= CURRENT_DATE - INTERVAL '30 days'
      WHEN lower($date_range::text) LIKE '%7 days%' OR lower($date_range::text) LIKE '%past week%' THEN pe.entry_date >= CURRENT_DATE - INTERVAL '7 days'
      WHEN lower($date_range::text) LIKE '%today%' THEN pe.entry_date >= CURRENT_DATE
      ELSE TRUE
    END
  )
ORDER BY pe.entry_date DESC
LIMIT GREATEST(1, LEAST(COALESCE($limit::integer, 5), 20));
