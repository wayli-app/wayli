-- GRANT SELECT on public_profiles to authenticated and anon roles
-- Required for the Fluxbase API to serve public profile data with JWT auth
GRANT SELECT ON public_profiles TO authenticated;
GRANT SELECT ON public_profiles TO anon;

-- Also ensure trip-related views/tables have proper grants
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_entries TO authenticated;
GRANT SELECT ON trip_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_media TO authenticated;
GRANT SELECT ON trip_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_comments TO authenticated;
GRANT SELECT ON trip_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_likes TO authenticated;
GRANT SELECT ON trip_likes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_plan_items TO authenticated;
GRANT SELECT ON trip_plan_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_collaborators TO authenticated;
GRANT SELECT ON trip_collaborators TO anon;
