-- Fix RLS recursion: trips ↔ trip_shares policies reference each other
-- Also ensure security functions exist (in case migration 059 didn't fully apply)

-- Ensure functions exist (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION public.is_trip_owner(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_see_trip(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR visibility = 'public'
            OR EXISTS(
                SELECT 1 FROM trip_shares
                WHERE trip_id = trip_uuid
                AND shared_with_user_id = auth.uid()
            )
        )
    ) OR EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND visibility = 'public'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_see_costs(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR (costs_visible_to = 'public' AND visibility = 'public')
            OR (costs_visible_to IN ('friends', 'public')
                AND auth.uid() IS NOT NULL
                AND EXISTS(
                    SELECT 1 FROM trip_shares
                    WHERE trip_id = trip_uuid
                    AND shared_with_user_id = auth.uid()
                ))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_see_gps(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR (gps_visible_to = 'public' AND visibility = 'public')
            OR (gps_visible_to IN ('friends', 'public')
                AND auth.uid() IS NOT NULL
                AND EXISTS(
                    SELECT 1 FROM trip_shares
                    WHERE trip_id = trip_uuid
                    AND shared_with_user_id = auth.uid()
                ))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_comment(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT auth.uid() IS NOT NULL
    AND EXISTS(
        SELECT 1 FROM trips
        WHERE id = trip_uuid
        AND (
            user_id = auth.uid()
            OR comments_allowed = 'public'
            OR (comments_allowed IN ('friends', 'public')
                AND EXISTS(
                    SELECT 1 FROM trip_shares
                    WHERE trip_id = trip_uuid
                    AND shared_with_user_id = auth.uid()
                ))
        )
    );
$$;

-- Now fix policies using these functions
DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips FOR SELECT USING (can_see_trip(trips.id));

DROP POLICY IF EXISTS trip_shares_select ON trip_shares;
CREATE POLICY trip_shares_select ON trip_shares FOR SELECT USING (
    shared_with_user_id = auth.uid()
    OR is_trip_owner(trip_id)
);
DROP POLICY IF EXISTS trip_shares_insert ON trip_shares;
CREATE POLICY trip_shares_insert ON trip_shares FOR INSERT WITH CHECK (is_trip_owner(trip_id));
DROP POLICY IF EXISTS trip_shares_delete ON trip_shares;
CREATE POLICY trip_shares_delete ON trip_shares FOR DELETE USING (is_trip_owner(trip_id));
