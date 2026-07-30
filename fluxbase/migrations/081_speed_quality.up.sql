-- 081_speed_quality.up.sql
--
-- Data-quality hardening for tracker_data.speed / distance / time_spent.
--
-- Background: the distance trigger (002_functions.up.sql) computes speed as
-- (distance / time_spent) * 3.6 with only a `time_spent > 0` guard. A single
-- bad GPS fix (~134 km jump) recorded ~1s after a valid point produced speed
-- values up to ~481,402 km/h (confirmed: 619 rows > 1000 km/h, max 481402.89,
-- out of 315,556). Those garbage speeds poison the transport-mode HMM's CV
-- windows and emissions. There was no CHECK on speed and the in-trigger cap was
-- 9999999999.99 (i.e. none).
--
-- This migration:
--   1. Replaces the trigger with one that (a) requires a >= 1s gap before
--      trusting the derived speed, (b) clamps the stored speed to a plausible
--      ceiling (1000 km/h — above the fastest modelled mode, airplane cruise),
--      and (c) leaves distance/time_spent intact for analytics.
--   2. Backfills existing rows so no stored speed exceeds the ceiling.
--   3. Adds a CHECK constraint so future bad values are rejected at insert.
--
-- The 1000 km/h ceiling preserves genuine flights (commercial cruise ~900-950)
-- while rejecting all observed glitches (nothing civilian exceeds 1000 km/h
-- ground speed). The literal is kept in sync with
-- MAX_PLAUSIBLE_SPEED_KMH in transport-mode.config.ts.

-- Speed ceiling (km/h). Above commercial cruise, below every observed glitch.
-- Kept as a literal (not a function) so the trigger + CHECK resolve reliably
-- regardless of search_path.
-- (Mirror of web/src/lib/utils/transport-mode.config.ts MAX_PLAUSIBLE_SPEED_KMH.)

-- ============================================================================
-- 1. Replace the distance/speed trigger with a robustified version.
-- ============================================================================
CREATE OR REPLACE FUNCTION "public"."trigger_calculate_distance"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE
    prev_point RECORD;
    calculated_distance DECIMAL;
    calculated_time_spent DECIMAL;
    stable_speed DECIMAL;
    -- Speed ceiling (km/h). Above commercial cruise (~950), below every observed glitch.
    max_plausible_speed CONSTANT DECIMAL := 1000;
    -- Minimum inter-point gap (s) before the derived speed is trusted.
    -- Sub-second gaps make distance/time explode (the 481k km/h outlier).
    min_time_spent CONSTANT DECIMAL := 1.0;
BEGIN
    IF NEW.location IS NOT NULL THEN
        -- Find the previous point for this user based on recorded_at.
        SELECT location, recorded_at
        INTO prev_point
        FROM public.tracker_data
        WHERE user_id = NEW.user_id
          AND recorded_at < NEW.recorded_at
          AND location IS NOT NULL
        ORDER BY recorded_at DESC
        LIMIT 1;

        IF prev_point IS NOT NULL THEN
            calculated_distance := public.st_distancesphere(prev_point.location, NEW.location);
            NEW.distance := calculated_distance;

            calculated_time_spent := EXTRACT(EPOCH FROM (NEW.recorded_at - prev_point.recorded_at));
            NEW.time_spent := calculated_time_spent;

            IF calculated_time_spent >= min_time_spent THEN
                stable_speed := (calculated_distance / calculated_time_spent) * 3.6;
            ELSE
                -- Sub-second gap: the division is unreliable. Keep distance/
                -- time_spent for the record, but don't compute a speed from a
                -- near-zero denominator. Leave speed unchanged on UPDATE, or 0
                -- on INSERT (upstream default).
                stable_speed := COALESCE(NEW.speed, 0);
            END IF;

            -- Hard clamp: nothing we model moves faster than this.
            NEW.speed := LEAST(ROUND(stable_speed::numeric, 2), max_plausible_speed);
        ELSE
            -- First point for this user.
            NEW.distance := 0;
            NEW.time_spent := 0;
            NEW.speed := 0;
        END IF;

        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."trigger_calculate_distance"() IS
    'Computes distance/time_spent/speed from the previous chronological point. Speed is only derived when the inter-point gap is >= 1s (sub-second gaps are untrusted) and is clamped to 1000 km/h.';

-- ============================================================================
-- 2. Backfill: clamp existing out-of-range speeds so the CHECK below can be added.
--    distance/time_spent are left untouched (they remain analytically useful).
-- ============================================================================
UPDATE public.tracker_data
SET speed = 1000,
    updated_at = NOW()
WHERE speed IS NOT NULL AND speed > 1000;

-- ============================================================================
-- 3. CHECK constraint so future impossible speeds are rejected at insert/update.
-- ============================================================================
ALTER TABLE "public"."tracker_data"
    DROP CONSTRAINT IF EXISTS "tracker_data_plausible_speed";

ALTER TABLE ONLY "public"."tracker_data" ADD CONSTRAINT "tracker_data_plausible_speed" CHECK (
    ("speed" IS NULL)
    OR ("speed" >= 0 AND "speed" <= 1000)
);
