-- Grant permissions to authenticated and anon roles
-- Required for the Fluxbase API to allow JWT-authenticated requests
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_plan_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_plan_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_collaborators TO anon;

-- Re-enable RLS (was disabled for debugging)
ALTER TABLE trip_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_collaborators ENABLE ROW LEVEL SECURITY;

-- Simple owner-based RLS policies
DROP POLICY IF EXISTS trip_plan_items_select ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_insert ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_update ON trip_plan_items;
DROP POLICY IF EXISTS trip_plan_items_delete ON trip_plan_items;
DROP POLICY IF EXISTS trip_collaborators_select ON trip_collaborators;
DROP POLICY IF EXISTS trip_collaborators_insert ON trip_collaborators;
DROP POLICY IF EXISTS trip_collaborators_delete ON trip_collaborators;

CREATE POLICY trip_plan_items_select ON trip_plan_items
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trip_plan_items_insert ON trip_plan_items
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY trip_plan_items_update ON trip_plan_items
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY trip_plan_items_delete ON trip_plan_items
    FOR DELETE USING (user_id = auth.uid());

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

-- Also fix CHAR columns to TEXT
ALTER TABLE trip_plan_items ALTER COLUMN currency TYPE text USING currency::text;
ALTER TABLE trips ALTER COLUMN budget_currency TYPE text USING budget_currency::text;
