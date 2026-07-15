-- Allow admin users to read ALL user profiles (not just their own)
-- Needed by the server admin settings page to list users with usernames
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_profiles'
        AND policyname = 'user_profiles_select_admin'
    ) THEN
        CREATE POLICY user_profiles_select_admin ON user_profiles
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM user_profiles up
                    WHERE up.id = auth.uid() AND up.role = 'admin'
                )
            );
    END IF;
END $$;
