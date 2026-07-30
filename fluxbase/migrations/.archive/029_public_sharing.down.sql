-- 029: Rollback public sharing
DROP POLICY IF EXISTS trips_public_read ON trips;
DROP POLICY IF EXISTS trip_entries_public_read ON trip_entries;
DROP POLICY IF EXISTS trip_media_public_read ON trip_media;
REVOKE SELECT ON trips FROM anon;
REVOKE SELECT ON trip_entries FROM anon;
REVOKE SELECT ON trip_media FROM anon;
DROP VIEW IF EXISTS public_profiles;
DELETE FROM app.settings WHERE key IN ('wayli.public_trips_require_auth', 'wayli.landing_redirect_username');
