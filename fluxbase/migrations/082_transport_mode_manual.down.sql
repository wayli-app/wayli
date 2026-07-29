-- 082_transport_mode_manual.down.sql
-- Reverts 082_transport_mode_manual.up.sql.

-- Recreate the view without transport_mode_manual, then drop the column.
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
    transport_mode,
    detection_reason,
    transport_mode_confidence,
    created_at,
    recorded_at as started_at
FROM "public"."tracker_data"
WHERE user_id = auth.uid();

COMMENT ON VIEW "public"."my_tracker_data" IS 'Secure view of tracker_data filtered to current user. Use this for LLM queries.';

GRANT SELECT ON "public"."my_tracker_data" TO "authenticated";

ALTER TABLE "public"."tracker_data"
    DROP COLUMN IF EXISTS "transport_mode_manual";
