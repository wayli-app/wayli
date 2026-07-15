-- Add per-trip setting for public plan items
ALTER TABLE trips ADD COLUMN IF NOT EXISTS plan_items_public boolean DEFAULT false;

-- Update RLS on trip_plan_items to allow public reads when trip opts in
-- First drop existing policies
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;

-- New SELECT policy: owner OR (trip is public AND plan_items_public)
CREATE POLICY trip_plan_items_select ON trip_plan_items FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM trips
        WHERE id = trip_plan_items.trip_id
        AND visibility = 'public'
        AND plan_items_public = true
    )
);

-- Grant SELECT to anon for public plan items
GRANT SELECT ON trip_plan_items TO anon;
