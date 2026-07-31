-- @fluxbase:description Add a place to the user's want-to-visit (wishlist). Geocoded coordinates are required (the Action agent gets them via discover-places before calling this). Returns the created row so the caller can confirm. Inserts with user_id = auth.uid() (RLS owner-only).
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "title": "text", "lat": "numeric", "lng": "numeric", "address?": "text", "type?": "text", "description?": "text", "country_code?": "text", "marker_type?": "text", "marker_color?": "text", "labels?": "text" }
-- @fluxbase:allowed-tables want_to_visit_places
-- @fluxbase:max-execution-time 15s

-- ponytail: location is a PostGIS geometry(Point,4326) NOT NULL, so build it
-- from lat/lng with ST_SetSRID(ST_MakePoint(lng, lat), 4326) — note the
-- MakePoint argument order is (lng, lat), the GeoJSON convention. user_id is
-- pinned to auth.uid() to satisfy the owner-only INSERT RLS policy.
INSERT INTO want_to_visit_places (
    user_id,
    title,
    location,
    address,
    type,
    description,
    country_code,
    marker_type,
    marker_color,
    labels
) VALUES (
    auth.uid(),
    $title::text,
    public.st_setsrid(public.st_makepoint($lng::numeric, $lat::numeric), 4326),
    $address::text,
    COALESCE($type::text, 'place'),
    $description::text,
    upper(left($country_code::text, 2)),
    COALESCE($marker_type::text, 'default'),
    COALESCE($marker_color::text, '#3B82F6'),
    -- labels comes in as a comma-joined string (LLMs can't easily emit arrays);
    -- split on comma and trim. NULL/empty -> empty array (the column default).
    CASE
        WHEN $labels::text IS NULL OR btrim($labels::text) = ''
            THEN ARRAY[]::text[]
        ELSE (SELECT array_agg(trim(part)) FROM unnest(string_to_array($labels::text, ',')) AS part)
    END
)
RETURNING
    id,
    title,
    address,
    type,
    favorite,
    country_code,
    public.st_y(location) AS latitude,
    public.st_x(location) AS longitude,
    created_at;
