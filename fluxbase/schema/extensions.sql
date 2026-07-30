-- Wayli database extensions
--
-- Extensions that Wayli requires but Fluxbase's bootstrap does NOT enable.
-- Fluxbase's bootstrap (run on every server startup) already enables:
--   uuid-ossp, pgcrypto, pg_trgm, btree_gin, vector, postgres_fdw
--
-- NOTE: These CREATE EXTENSION statements are now included at the top of
-- public.sql itself, because the declarative schema's direct-apply path runs
-- as the admin (superuser) user, which has the privileges to create extensions.
-- The Fluxbase SQL execute API (service_role) and `fluxbase extensions enable`
-- (requires catalog population) can't be used for this. This file is kept for
-- documentation/reference only.
--
-- PostGIS provides the geography/geometry types and ST_* functions used by
-- tracker_data.location (geography) and the place_visits location indexes.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
