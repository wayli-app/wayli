-- @fluxbase:description Create a new trip for the user (status 'planned', matching manual UI creation). Use for "add a trip to Lisbon in October", "create a trip". Populates metadata.primaryCity/visitedCities so the new trip is immediately well-formed for the my_trips view and cover-image generator. Returns the created row so the caller can confirm. Inserts with user_id = auth.uid() (RLS owner-only).
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "title": "text", "start_date": "date", "end_date": "date", "description?": "text", "primary_city?": "text", "labels?": "text" }
-- @fluxbase:allowed-tables trips
-- @fluxbase:max-execution-time 15s

-- ponytail: build metadata so the trip shows up correctly in my_trips
-- (primaryCity/visitedCities are parsed from metadata by the view) and so the
-- image generator can pick a cover. labels comes in comma-joined (LLMs can't
-- easily emit arrays); NULL/empty -> empty array (the column default).
INSERT INTO trips (
    user_id,
    title,
    description,
    start_date,
    end_date,
    status,
    visibility,
    labels,
    metadata
) VALUES (
    auth.uid(),
    $title::text,
    $description::text,
    $start_date::date,
    $end_date::date,
    'planned',
    'private',
    CASE
        WHEN $labels::text IS NULL OR btrim($labels::text) = ''
            THEN ARRAY[]::text[]
        ELSE (SELECT array_agg(trim(part)) FROM unnest(string_to_array($labels::text, ',')) AS part)
    END,
    jsonb_build_object(
        'primaryCity', COALESCE($primary_city::text, ''),
        'visitedCities',
            CASE WHEN $primary_city::text IS NULL OR btrim($primary_city::text) = ''
                 THEN '[]'::jsonb
                 ELSE jsonb_build_array($primary_city::text)
            END,
        'dataPoints', 0,
        'tripDays',
            GREATEST(($end_date::date - $start_date::date) + 1, 0)
    )
)
RETURNING
    id,
    title,
    description,
    start_date,
    end_date,
    status,
    metadata->>'primaryCity' AS primary_city,
    created_at;
