-- @fluxbase:description Update editable details of an existing trip owned by the user (title, dates, description, labels). Resolves the trip by id (owner-scoped via RLS). Use for "rename my Paris trip", "fix the dates", "add a description". Deliberately does NOT touch metadata (unlike the legacy updateTrip service which could wipe it) — only the named columns are updated; NULL params leave a column unchanged. Returns the updated row.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "id": "uuid", "title?": "text", "start_date?": "date", "end_date?": "date", "description?": "text", "labels?": "text" }
-- @fluxbase:allowed-tables trips
-- @fluxbase:max-execution-time 15s

UPDATE trips
SET
    -- Only overwrite a column when the caller supplied a value; NULL param = leave as-is.
    title = COALESCE($title::text, title),
    start_date = COALESCE($start_date::date, start_date),
    end_date = COALESCE($end_date::date, end_date),
    description = CASE WHEN $description::text IS NULL THEN description ELSE $description::text END,
    labels =
        CASE
            WHEN $labels::text IS NULL THEN labels
            WHEN btrim($labels::text) = '' THEN ARRAY[]::text[]
            ELSE (SELECT array_agg(trim(part)) FROM unnest(string_to_array($labels::text, ',')) AS part)
        END,
    updated_at = NOW()
WHERE id = $id::uuid
  AND user_id = auth.uid()
RETURNING
    id,
    title,
    description,
    start_date,
    end_date,
    status,
    metadata->>'primaryCity' AS primary_city,
    updated_at;
