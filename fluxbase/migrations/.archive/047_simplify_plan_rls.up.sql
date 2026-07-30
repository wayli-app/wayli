-- Simplify RLS policies to avoid recursive subquery issues

-- Drop complex policies
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_insert ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_update ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_delete ON trip_plan_items;

DROP POLICY IF EXISTS trip_collaborators_select ON trip_collaborators;
DROP POLICY IF EXISTS trip_collaborators_insert ON trip_collaborators;
DROP POLICY IF EXISTS trip_collaborators_delete ON trip_collaborators;

-- Simple owner-based policies for plan items
CREATE POLICY trip_plan_items_select ON trip_plan_items
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trip_plan_items_insert ON trip_plan_items
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY trip_plan_items_update ON trip_plan_items
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY trip_plan_items_delete ON trip_plan_items
    FOR DELETE USING (user_id = auth.uid());

-- Collaborators: owner can manage via trip ownership check
-- Use a simple approach: authenticated users can read collaborators
-- for trips they own (checked via the trip_plan_items user_id match)
CREATE POLICY trip_collaborators_select ON trip_collaborators
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM trips WHERE id = trip_collaborators.trip_id AND user_id = auth.uid())
    );
CREATE POLICY trip_collaborators_insert ON trip_collaborators
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM trips WHERE id = trip_collaborators.trip_id AND user_id = auth.uid())
    );
CREATE POLICY trip_collaborators_delete ON trip_collaborators
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM trips WHERE id = trip_collaborators.trip_id AND user_id = auth.uid())
    );
