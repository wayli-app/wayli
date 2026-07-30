-- Wayli database extensions
--
-- Extensions that Wayli requires but Fluxbase's bootstrap does NOT enable.
-- Fluxbase's bootstrap (run on every server startup) already enables:
--   uuid-ossp, pgcrypto, pg_trgm, btree_gin, vector, postgres_fdw
--
-- pgschema cannot manage CREATE EXTENSION (extensions are database-scoped, not
-- schema objects), so they live here, separate from public.sql, and are applied
-- out-of-band. This file is idempotent and safe to re-run.
--
-- PostGIS provides the geography/geometry types and ST_* functions used by
-- tracker_data.location (geography) and the place_visits location indexes.

CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "postgis_topology" WITH SCHEMA "topology";
