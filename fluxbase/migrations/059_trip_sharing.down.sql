-- Revert trip sharing (not recommended — data loss)
DROP VIEW IF EXISTS visible_plan_items;
DROP FUNCTION IF EXISTS can_see_trip(uuid);
DROP FUNCTION IF EXISTS can_see_costs(uuid);
DROP FUNCTION IF EXISTS can_see_gps(uuid);
DROP FUNCTION IF EXISTS can_comment(uuid);
DROP TABLE IF EXISTS trip_gps_tracks;
DROP TABLE IF EXISTS trip_shares;
DROP TABLE IF EXISTS user_connections;
ALTER TABLE trips DROP COLUMN IF EXISTS costs_visible_to;
ALTER TABLE trips DROP COLUMN IF EXISTS gps_visible_to;
ALTER TABLE trips DROP COLUMN IF EXISTS comments_allowed;
