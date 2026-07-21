-- Fix handle_new_user: reference correct column name (user_metadata, not raw_user_meta_data)
-- The old function referenced a column that doesn't exist in current Fluxbase,
-- causing the ENTIRE function body to error out. The EXCEPTION WHEN OTHERS block
-- swallowed the error silently — user creation succeeded but NO user_profiles row
-- was created, NO role was synced, NO preferences were inserted. The first user
-- never got admin because the function crashed before the INSERT INTO user_profiles.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    user_role text;
BEGIN
    -- Determine user role:
    --   First user ever -> admin
    --   Signup metadata with role='reader' -> reader
    --   Otherwise -> user
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM user_profiles LIMIT 1) THEN 'admin'
        WHEN new.user_metadata->>'role' = 'reader' THEN 'reader'
        ELSE 'user'
    END INTO user_role;

    -- Create the user profile
    INSERT INTO user_profiles (id, role)
    VALUES (new.id, user_role)
    ON CONFLICT (id) DO NOTHING;

    -- Create default preferences
    INSERT INTO user_preferences (id)
    VALUES (new.id)
    ON CONFLICT (id) DO NOTHING;

    -- Sync the role to auth.users for JWT claims
    UPDATE auth.users SET role = user_role WHERE id = new.id;

    RETURN new;

EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't block user creation
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$;
