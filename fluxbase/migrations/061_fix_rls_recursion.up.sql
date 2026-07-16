-- Fix RLS recursion: trips ↔ trip_shares policies reference each other
-- Solution: use SECURITY DEFINER functions instead of inline subqueries

-- Helper: is the current user the owner of this trip?
CREATE OR REPLACE FUNCTION public.is_trip_owner(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND user_id = auth.uid());
$$;

-- Fix trips_select: use can_see_trip() instead of inline EXISTS from trip_shares
DROP POLICY IF EXISTS trips_select ON trips;
CREATE POLICY trips_select ON trips FOR SELECT USING (can_see_trip(trips.id));

-- Fix trip_shares policies: use is_trip_owner() instead of inline EXISTS from trips
DROP POLICY IF EXISTS trip_shares_select ON trip_shares;
CREATE POLICY trip_shares_select ON trip_shares FOR SELECT USING (
    shared_with_user_id = auth.uid()
    OR is_trip_owner(trip_id)
);
DROP POLICY IF EXISTS trip_shares_insert ON trip_shares;
CREATE POLICY trip_shares_insert ON trip_shares FOR INSERT WITH CHECK (is_trip_owner(trip_id));
DROP POLICY IF EXISTS trip_shares_delete ON trip_shares;
CREATE POLICY trip_shares_delete ON trip_shares FOR DELETE USING (is_trip_owner(trip_id));
