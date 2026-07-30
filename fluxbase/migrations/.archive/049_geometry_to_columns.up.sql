-- Change geometry column to text (store as "lat,lng" string)
-- The Fluxbase API may not handle PostGIS geometry type for user-created tables
ALTER TABLE trip_plan_items DROP COLUMN IF EXISTS location;
ALTER TABLE trip_plan_items ADD COLUMN location_lat double precision;
ALTER TABLE trip_plan_items ADD COLUMN location_lng double precision;
