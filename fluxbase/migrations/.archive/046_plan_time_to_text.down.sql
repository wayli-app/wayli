ALTER TABLE trip_plan_items ALTER COLUMN start_time TYPE TIME USING start_time::TIME;
ALTER TABLE trip_plan_items ALTER COLUMN end_time TYPE TIME USING end_time::TIME;
