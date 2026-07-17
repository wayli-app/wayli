-- Restore the boolean column from plan_visible_to
ALTER TABLE trips ADD COLUMN IF NOT EXISTS plan_items_public boolean DEFAULT false;
UPDATE trips SET plan_items_public = true WHERE plan_visible_to = 'public';

DROP FUNCTION IF EXISTS public.can_see_plan(uuid);

DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
CREATE POLICY trip_plan_items_select ON trip_plan_items FOR SELECT USING (
    user_id = auth.uid()
    OR (can_see_trip(trip_id)
        AND EXISTS(SELECT 1 FROM trips WHERE id = trip_plan_items.trip_id AND plan_items_public = true))
);

ALTER TABLE trips DROP COLUMN IF EXISTS plan_visible_to;
