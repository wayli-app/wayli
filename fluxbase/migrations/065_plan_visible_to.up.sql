-- Replace plan_items_public boolean with 3-state plan_visible_to (private/friends/public)
-- Matches the pattern of costs_visible_to / gps_visible_to / comments_allowed

ALTER TABLE trips ADD COLUMN IF NOT EXISTS plan_visible_to text DEFAULT 'private'
    CHECK (plan_visible_to IN ('private', 'friends', 'public'));

-- Migrate from old boolean: public=true -> 'public', else 'private'
UPDATE trips SET plan_visible_to = 'public' WHERE plan_items_public = true AND plan_visible_to = 'private';

-- can_see_plan(): owner OR (public + visibility public) OR (friends/public + trip_share)
CREATE OR REPLACE FUNCTION public.can_see_plan(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (plan_visible_to = 'public' AND visibility = 'public')
        OR (plan_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
    ));
$$;

-- Update RLS policy on trip_plan_items to use can_see_plan
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
CREATE POLICY trip_plan_items_select ON trip_plan_items FOR SELECT USING (
    user_id = auth.uid()
    OR (can_see_trip(trip_id) AND can_see_plan(trip_id))
);

-- Drop the old boolean column (data already migrated)
ALTER TABLE trips DROP COLUMN IF EXISTS plan_items_public;
