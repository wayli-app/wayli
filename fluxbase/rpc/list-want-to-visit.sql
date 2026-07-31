-- @fluxbase:description List the user's want-to-visit (wishlist) places, newest first. Returns coordinates, address, type, favorite flag, and labels so the assistant can answer "what's on my wishlist" or check for duplicates before adding. RLS-scoped to the caller.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "limit?": "integer", "search?": "text" }
-- @fluxbase:allowed-tables want_to_visit_places
-- @fluxbase:max-execution-time 15s

SELECT
    id,
    title,
    address,
    type,
    favorite,
    country_code,
    description,
    labels,
    public.st_y(location) AS latitude,
    public.st_x(location) AS longitude,
    created_at,
    updated_at
FROM want_to_visit_places
WHERE
    -- RLS already restricts to auth.uid(); the optional search is a fuzzy
    -- title/address match for "do I already have X on my list?".
    ($search::text IS NULL
        OR title ILIKE '%' || $search::text || '%'
        OR address ILIKE '%' || $search::text || '%')
ORDER BY favorite DESC, created_at DESC
LIMIT GREATEST(1, LEAST(COALESCE($limit::integer, 50), 100));
