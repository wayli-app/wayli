-- BEFORE INSERT trigger: set first user's role to instance_admin BEFORE the row
-- is saved, so the JWT issued at signup time includes the admin role.
-- The AFTER INSERT trigger (handle_new_user) runs too late — the JWT is already
-- minted with the default 'authenticated' role by then.
CREATE OR REPLACE FUNCTION public.set_first_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Check if any user_profiles exist. If not, this is the first user.
    -- Must check user_profiles (not auth.users) because the first auth.users
    -- row is being inserted RIGHT NOW and hasn't committed yet.
    IF NOT EXISTS (SELECT 1 FROM user_profiles LIMIT 1) THEN
        NEW.role := 'instance_admin';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_first_user_admin ON auth.users;
CREATE TRIGGER set_first_user_admin
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.set_first_user_admin();
