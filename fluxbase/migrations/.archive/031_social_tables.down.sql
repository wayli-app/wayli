DROP TABLE IF EXISTS trip_comments CASCADE;
DROP TABLE IF EXISTS trip_likes CASCADE;

-- Restore role constraint (remove 'reader')
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('user', 'admin', 'moderator'));

-- Note: handle_new_user function is not rolled back (the updated version
-- still works correctly — it just never sees role='reader' metadata).
