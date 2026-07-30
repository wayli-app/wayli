-- Change TIME columns to TEXT (HH:MM format) for API compatibility
ALTER TABLE trip_plan_items ALTER COLUMN start_time TYPE text USING start_time::text;
ALTER TABLE trip_plan_items ALTER COLUMN end_time TYPE text USING end_time::text;
