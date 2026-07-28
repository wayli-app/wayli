-- 078_transport_mode.down.sql

-- Recreate my_tracker_data WITHOUT the transport-mode columns (reverse of up).
DROP VIEW IF EXISTS "public"."my_tracker_data";

CREATE VIEW "public"."my_tracker_data"
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
    recorded_at,
    ST_X(location::geometry) as longitude,
    ST_Y(location::geometry) as latitude,
    country_code,
    geocode,
    accuracy,
    created_at,
    recorded_at as started_at
FROM "public"."tracker_data"
WHERE user_id = auth.uid();

COMMENT ON VIEW "public"."my_tracker_data" IS 'Secure view of tracker_data filtered to current user. Use this for LLM queries.';

GRANT SELECT ON "public"."my_tracker_data" TO "authenticated";

-- Drop watermark table.
DROP TABLE IF EXISTS "public"."transport_mode_state";

-- Drop transport-mode columns from tracker_data.
ALTER TABLE "public"."tracker_data"
    DROP COLUMN IF EXISTS "transport_mode_confidence",
    DROP COLUMN IF EXISTS "detection_reason",
    DROP COLUMN IF EXISTS "transport_mode";
