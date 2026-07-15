-- Allow admin users to read ALL user profiles (not just their own)
-- Needed by the server admin settings page to list users with usernames
CREATE POLICY IF NOT EXISTS user_profiles_select_admin ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid() AND up.role = 'admin'
        )
    );
