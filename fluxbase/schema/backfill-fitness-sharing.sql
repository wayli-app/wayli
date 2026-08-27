-- One-off backfill for the fitness-sharing migration.
--
-- Adds the per-activity visibility override column, the shared-access SELECT
-- policy, the audience/privacy helper functions, the public view, and the
-- friends-audience fix for trips (trips_select / can_see_trip /
-- public_trip_entries / public_trip_media previously never honored
-- visibility='friends').
--
-- Idempotent: safe to re-run; everything is IF NOT EXISTS / OR REPLACE /
-- DROP-IF-EXISTS-then-CREATE.
--
-- Run against an existing environment once after the schema sync that ships
-- the fitness-sharing tables/functions:
--   docker exec -i fluxbase-postgres psql -U fluxbase -d fluxbase \
--     < fluxbase/schema/backfill-fitness-sharing.sql
-- (or the kubectl equivalent for k8s deployments — see schema/README.md)

BEGIN;

-- 1. Per-activity visibility override (NULL = inherit the global default).
ALTER TABLE fitness_activities ADD COLUMN IF NOT EXISTS visibility text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fitness_activities_visibility_check'
    ) THEN
        ALTER TABLE fitness_activities
            ADD CONSTRAINT fitness_activities_visibility_check
            CHECK (visibility IS NULL OR visibility IN ('private', 'friends', 'public'));
    END IF;
END
$$;

COMMENT ON COLUMN fitness_activities.visibility IS 'Sharing audience override: private, friends, or public. NULL inherits the user''s global fitness_sharing.default preference (resolved by effective_activity_visibility()).';

-- 2. Numeric jsonb extraction used by privacy-zone parsing (never raises on
--    the several historical home_address / trip_exclusion shapes).
CREATE OR REPLACE FUNCTION jsonb_num(j jsonb, k text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN j IS NULL OR j ->> k IS NULL OR (j ->> k) !~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN NULL
        ELSE (j ->> k)::double precision
    END;
$$;

-- 3. Effective audience: per-activity override, else the user's global
--    fitness_sharing.default preference, else private.
CREATE OR REPLACE FUNCTION effective_activity_visibility(
    activity_uuid uuid
)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        CASE
            WHEN fa.visibility IS NOT NULL THEN fa.visibility
            ELSE COALESCE(
                NULLIF(
                    CASE WHEN (up.preferences -> 'fitness_sharing' ->> 'default') IN ('private', 'friends', 'public')
                         THEN up.preferences -> 'fitness_sharing' ->> 'default'
                         ELSE NULL
                    END, ''),
                'private')
        END
    FROM fitness_activities fa
    LEFT JOIN user_preferences up ON up.id = fa.user_id
    WHERE fa.id = activity_uuid;
$$;

COMMENT ON FUNCTION effective_activity_visibility(uuid) IS 'Sharing audience of an activity: the per-activity visibility when set, else the user''s global fitness_sharing.default preference (private when unset).';

-- 4. Access gate (owner / public / accepted friend).
CREATE OR REPLACE FUNCTION can_see_activity(
    activity_uuid uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS(
        SELECT 1 FROM fitness_activities fa
        WHERE fa.id = activity_uuid
          AND (
              fa.user_id = auth.uid()
              OR effective_activity_visibility(fa.id) = 'public'
              OR (effective_activity_visibility(fa.id) = 'friends'
                  AND auth.uid() IS NOT NULL
                  AND EXISTS(
                      SELECT 1 FROM user_connections uc
                      WHERE uc.status = 'accepted'
                        AND ((uc.user_id = auth.uid() AND uc.friend_id = fa.user_id)
                          OR (uc.friend_id = auth.uid() AND uc.user_id = fa.user_id))
                  ))
          )
    );
$$;

COMMENT ON FUNCTION can_see_activity(uuid) IS 'Whether the caller may see a fitness activity: owner, effective visibility public, or an accepted friend connection when friends. Mirrors can_see_trip().';

-- 5. Privacy zones: home address + trip exclusions (any stored JSON shape)
--    with the per-user radius (preferences.fitness_sharing.privacy_radius_m,
--    default 250 m, clamped 50–2000 m).
CREATE OR REPLACE FUNCTION privacy_zones(
    p_user uuid
)
RETURNS TABLE(lat double precision, lng double precision, radius_m double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH r AS (
        SELECT COALESCE(
            LEAST(GREATEST(jsonb_num(up.preferences -> 'fitness_sharing', 'privacy_radius_m'), 50), 2000),
            250
        ) AS radius
        FROM user_preferences up
        WHERE up.id = p_user
    ),
    home AS (
        SELECT
            COALESCE(
                jsonb_num(p.home_address, 'lat'),
                jsonb_num(p.home_address -> 'location', 'lat'),
                jsonb_num(p.home_address -> 'coordinates', 'lat')
            ) AS lat,
            COALESCE(
                jsonb_num(p.home_address, 'lng'),
                jsonb_num(p.home_address, 'lon'),
                jsonb_num(p.home_address -> 'location', 'lng'),
                jsonb_num(p.home_address -> 'location', 'lon'),
                jsonb_num(p.home_address -> 'coordinates', 'lng'),
                jsonb_num(p.home_address -> 'coordinates', 'lon')
            ) AS lng
        FROM user_profiles p
        WHERE p.id = p_user AND p.home_address IS NOT NULL
    ),
    excl AS (
        SELECT
            COALESCE(
                jsonb_num(e -> 'location', 'lat'),
                jsonb_num(e -> 'location' -> 'coordinates', 'lat'),
                jsonb_num(e, 'lat')
            ) AS lat,
            COALESCE(
                jsonb_num(e -> 'location', 'lng'),
                jsonb_num(e -> 'location', 'lon'),
                jsonb_num(e -> 'location' -> 'coordinates', 'lng'),
                jsonb_num(e -> 'location' -> 'coordinates', 'lon'),
                jsonb_num(e, 'lng'),
                jsonb_num(e, 'lon')
            ) AS lng
        FROM user_preferences up,
             jsonb_array_elements(CASE WHEN jsonb_typeof(up.trip_exclusions) = 'array'
                                        THEN up.trip_exclusions ELSE '[]'::jsonb END) AS e
        WHERE up.id = p_user
    )
    SELECT home.lat, home.lng, r.radius FROM home, r
    WHERE home.lat IS NOT NULL AND home.lng IS NOT NULL
    UNION ALL
    SELECT excl.lat, excl.lng, r.radius FROM excl, r
    WHERE excl.lat IS NOT NULL AND excl.lng IS NOT NULL;
$$;

COMMENT ON FUNCTION privacy_zones(uuid) IS 'Privacy zones (home address + trip exclusions, any stored JSON shape) with the user''s privacy radius in meters. Shared-track RPCs drop tracker points within this radius of any zone.';

-- 6. Shared-access SELECT policy on fitness_activities.
DROP POLICY IF EXISTS "Users can view fitness activities shared with them" ON fitness_activities;
CREATE POLICY "Users can view fitness activities shared with them" ON fitness_activities
    FOR SELECT TO authenticated USING (can_see_activity(id));

-- 7. Trip-track RPC retrofitted with the same privacy clipping.
CREATE OR REPLACE FUNCTION get_public_trip_track(
    trip_uuid uuid
)
RETURNS TABLE(lat double precision, lng double precision, recorded_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    trip_user_id uuid;
    trip_start date;
    trip_end date;
BEGIN
    IF NOT can_see_gps(trip_uuid) THEN
        RETURN;
    END IF;

    SELECT user_id, start_date, end_date
    INTO trip_user_id, trip_start, trip_end
    FROM trips
    WHERE id = trip_uuid;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH zones AS MATERIALIZED (
        SELECT * FROM privacy_zones(trip_user_id)
    )
    SELECT
        ST_Y(tracker_data.location::public.geometry)::double precision AS lat,
        ST_X(tracker_data.location::public.geometry)::double precision AS lng,
        tracker_data.recorded_at
    FROM tracker_data
    WHERE tracker_data.user_id = trip_user_id
        AND tracker_data.recorded_at >= trip_start::timestamptz
        AND tracker_data.recorded_at <= (trip_end + INTERVAL '1 day')::timestamptz
        AND NOT EXISTS (
            SELECT 1 FROM zones z
            WHERE ST_DWithin(
                tracker_data.location::geography,
                ST_SetSRID(ST_MakePoint(z.lng, z.lat), 4326)::geography,
                z.radius_m
            )
        )
    ORDER BY tracker_data.recorded_at;
END;
$$;

COMMENT ON FUNCTION get_public_trip_track(uuid) IS 'Returns the GPS track for a trip, with points inside the owner''s privacy zones (home + trip exclusions) clipped out. Gated by can_see_gps(trip_uuid) (owner, or gps_visible_to permits the caller). SECURITY DEFINER — bypasses tracker_data RLS, which has no anon/public SELECT policy.';

-- 8. Fitness activity track RPC (privacy-clipped).
CREATE OR REPLACE FUNCTION get_public_activity_track(
    activity_uuid uuid
)
RETURNS TABLE(lat double precision, lng double precision, recorded_at timestamptz, speed numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    act_user_id uuid;
    act_started timestamptz;
    act_ended timestamptz;
BEGIN
    IF NOT can_see_activity(activity_uuid) THEN
        RETURN;
    END IF;

    SELECT user_id, started_at, COALESCE(ended_at, started_at + INTERVAL '24 hours')
    INTO act_user_id, act_started, act_ended
    FROM fitness_activities
    WHERE id = activity_uuid;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH zones AS MATERIALIZED (
        SELECT * FROM privacy_zones(act_user_id)
    )
    SELECT
        ST_Y(tracker_data.location::public.geometry)::double precision AS lat,
        ST_X(tracker_data.location::public.geometry)::double precision AS lng,
        tracker_data.recorded_at,
        tracker_data.speed
    FROM tracker_data
    WHERE tracker_data.user_id = act_user_id
        AND tracker_data.recorded_at >= act_started
        AND tracker_data.recorded_at <= act_ended
        AND NOT EXISTS (
            SELECT 1 FROM zones z
            WHERE ST_DWithin(
                tracker_data.location::geography,
                ST_SetSRID(ST_MakePoint(z.lng, z.lat), 4326)::geography,
                z.radius_m
            )
        )
    ORDER BY tracker_data.recorded_at;
END;
$$;

COMMENT ON FUNCTION get_public_activity_track(uuid) IS 'Returns the GPS track + device speed for a fitness activity, with points inside the owner''s privacy zones (home + trip exclusions) clipped out. Gated by can_see_activity(activity_uuid). SECURITY DEFINER — bypasses tracker_data RLS, which has no anon/public SELECT policy. Heart-rate/power/cadence records are never served here — only the owner reads fitness_records.';

-- 9. Friends-audience fix for trips: trips_select never honored
--    visibility='friends' although both apps let users set it (and the
--    fresh-schema CHECK even rejected storing it — relaxed here too).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'trips_visibility_check'
    ) THEN
        ALTER TABLE trips DROP CONSTRAINT trips_visibility_check;
    END IF;
    ALTER TABLE trips
        ADD CONSTRAINT trips_visibility_check
        CHECK (visibility IN ('private', 'friends', 'public', 'unlisted'));
END
$$;

DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips FOR SELECT TO PUBLIC USING (
    (user_id = auth.uid())
    OR (visibility = 'public')
    OR (EXISTS (
        SELECT 1 FROM trip_shares
        WHERE trip_shares.trip_id = trips.id
          AND trip_shares.shared_with_user_id = auth.uid()
    ))
    OR (
        visibility = 'friends'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM user_connections uc
            WHERE uc.status = 'accepted'
              AND ((uc.user_id = auth.uid() AND uc.friend_id = trips.user_id)
                OR (uc.friend_id = auth.uid() AND uc.user_id = trips.user_id))
        )
    )
);

CREATE OR REPLACE FUNCTION can_see_trip(
    trip_uuid uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(
        SELECT 1 FROM trips WHERE id = trip_uuid
        AND (user_id = auth.uid() OR visibility = 'public'
             OR visibility = 'friends'
                AND EXISTS(
                    SELECT 1 FROM user_connections uc
                    WHERE uc.status = 'accepted'
                      AND ((uc.user_id = auth.uid() AND uc.friend_id = trips.user_id)
                        OR (uc.friend_id = auth.uid() AND uc.user_id = trips.user_id))
                )
             OR EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
    ) OR EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND visibility = 'public');
$$;

CREATE OR REPLACE VIEW public_trip_entries AS
 SELECT e.id,
    e.trip_id,
    e.user_id AS trip_user_id,
    e.title,
    e.body,
    e.entry_date,
    e.end_date,
    t.title AS trip_title,
    t.description AS trip_description,
    t.image_url AS trip_image_url,
    t.user_id AS trip_owner_id,
    t.start_date AS trip_start,
    t.end_date AS trip_end,
    t.visibility AS trip_visibility,
    e.cover_media_id,
    e.blocks
   FROM trip_entries e
     JOIN trips t ON t.id = e.trip_id
  WHERE e.status = 'published'::text AND (t.user_id = auth.uid() OR t.visibility = 'public'::text OR (EXISTS ( SELECT 1
           FROM trip_shares
          WHERE trip_shares.trip_id = t.id AND trip_shares.shared_with_user_id = auth.uid())) OR (t.visibility = 'friends'::text AND auth.uid() IS NOT NULL AND EXISTS ( SELECT 1
           FROM user_connections uc
          WHERE uc.status = 'accepted'::text AND ((uc.user_id = auth.uid() AND uc.friend_id = t.user_id) OR (uc.friend_id = auth.uid() AND uc.user_id = t.user_id)))));

CREATE OR REPLACE VIEW public_trip_media AS
 SELECT id,
    trip_id,
    user_id,
    storage_path,
    thumbnail_path,
    width,
    height,
    sort_order,
    created_at
   FROM trip_media m
  WHERE (EXISTS ( SELECT 1
           FROM trips t
          WHERE t.id = m.trip_id AND (t.user_id = auth.uid() OR t.visibility = 'public'::text OR (EXISTS ( SELECT 1
                   FROM trip_shares
                  WHERE trip_shares.trip_id = t.id AND trip_shares.shared_with_user_id = auth.uid())) OR (t.visibility = 'friends'::text AND auth.uid() IS NOT NULL AND EXISTS ( SELECT 1
                   FROM user_connections uc
                  WHERE uc.status = 'accepted'::text AND ((uc.user_id = auth.uid() AND uc.friend_id = t.user_id) OR (uc.friend_id = auth.uid() AND uc.user_id = t.user_id)))))));

-- 10. Public projection of shared activities (no health metrics, no device
--     identity).
CREATE OR REPLACE VIEW public_fitness_activities AS
 SELECT fa.id,
    fa.user_id,
    fa.title,
    fa.description,
    fa.sport,
    fa.sub_sport,
    fa.started_at,
    fa.ended_at,
    fa.total_distance_m,
    fa.elapsed_time_s,
    fa.moving_time_s,
    fa.calories,
    effective_activity_visibility(fa.id) AS effective_visibility
   FROM fitness_activities fa
  WHERE can_see_activity(fa.id);

-- 11. Grants (mirroring get_public_trip_track / public_profiles).
GRANT EXECUTE ON FUNCTION get_public_activity_track(activity_uuid uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_public_activity_track(activity_uuid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_activity_track(activity_uuid uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_public_activity_track(activity_uuid uuid) TO tenant_migration_role;
GRANT EXECUTE ON FUNCTION get_public_activity_track(activity_uuid uuid) TO tenant_service;

GRANT SELECT ON TABLE public_fitness_activities TO anon;
GRANT SELECT ON TABLE public_fitness_activities TO authenticated;
GRANT SELECT ON TABLE public_fitness_activities TO service_role;

-- trips_select policy subqueries must be evaluable for anonymous visitors
-- (RLS still hides every row of both tables from them).
GRANT SELECT ON TABLE trip_shares TO anon;
GRANT SELECT ON TABLE user_connections TO anon;

COMMIT;
