ALTER TABLE trip_plan_items DROP COLUMN IF EXISTS location_lat;
ALTER TABLE trip_plan_items DROP COLUMN IF EXISTS location_lng;
ALTER TABLE trip_plan_items ADD COLUMN location geometry(Point, 4326);
