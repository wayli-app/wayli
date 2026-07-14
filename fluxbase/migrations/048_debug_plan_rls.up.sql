-- Debug: bypass RLS entirely to isolate the 500 error source
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_insert ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_update ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_delete ON trip_plan_items;

DROP POLICY IF EXISTS trip_collaborators_select ON trip_collaborators;
DROP POLICY IF EXISTS trip_collaborators_insert ON trip_collaborators;
DROP POLICY IF EXISTS trip_collaborators_delete ON trip_collaborators;

-- Permissive: any authenticated user can read
CREATE POLICY trip_plan_items_select ON trip_plan_items
    FOR SELECT USING (true);
CREATE POLICY trip_plan_items_insert ON trip_plan_items
    FOR INSERT WITH CHECK (true);
CREATE POLICY trip_plan_items_update ON trip_plan_items
    FOR UPDATE USING (true);
CREATE POLICY trip_plan_items_delete ON trip_plan_items
    FOR DELETE USING (true);

CREATE POLICY trip_collaborators_select ON trip_collaborators
    FOR SELECT USING (true);
CREATE POLICY trip_collaborators_insert ON trip_collaborators
    FOR INSERT WITH CHECK (true);
CREATE POLICY trip_collaborators_delete ON trip_collaborators
    FOR DELETE USING (true);
