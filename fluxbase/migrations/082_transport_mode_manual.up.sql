-- 082_transport_mode_manual.up.sql
--
-- Manual-override flag for transport mode. Lets a user correct the detected
-- transport_mode of a segment from the Location Data map. Once a point is
-- flagged transport_mode_manual = true, the detect-transport-mode job MUST NOT
-- overwrite it on re-decode (the job's UPDATE filters with
-- .neq('transport_mode_manual', true) — see run-helpers.ts persistDecisions).
--
-- Without this, every re-run of the detection job would silently erase the
-- user's manual corrections.

-- 1. Add the override flag. Default false; existing rows are non-manual.
ALTER TABLE "public"."tracker_data"
    ADD COLUMN IF NOT EXISTS "transport_mode_manual" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."tracker_data"."transport_mode_manual" IS
    'true when transport_mode was set manually by the user (the detect-transport-mode job must not overwrite these rows).';

-- 2. Recreate my_tracker_data to expose the new column. Must DROP before CREATE
--    (cannot change a view column list with CREATE OR REPLACE). Re-issue the
--    SELECT grant that the DROP loses. Mirrors 078_transport_mode.up.sql.
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
    transport_mode_manual,
    created_at,
    recorded_at as started_at
FROM "public"."tracker_data"
WHERE user_id = auth.uid();

COMMENT ON VIEW "public"."my_tracker_data" IS 'Secure view of tracker_data filtered to current user. Use this for LLM queries.';

GRANT SELECT ON "public"."my_tracker_data" TO "authenticated";
