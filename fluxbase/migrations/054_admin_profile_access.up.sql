-- Allow admin users to read ALL user profiles (not just their own)
-- Needed by the server admin settings page to list users with usernames

-- SECURITY DEFINER function to check admin role without RLS recursion
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_profiles'
        AND policyname = 'user_profiles_select_admin'
    ) THEN
        CREATE POLICY user_profiles_select_admin ON user_profiles
            FOR SELECT USING (public.is_current_user_admin());
    END IF;
END $$;
