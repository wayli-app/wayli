-- Fix handle_new_user: set auth.users.role = 'instance_admin' for admin users
-- Migration 068 was already applied with the old function body that does
-- UPDATE auth.users SET role = user_role (which is 'admin'). Fluxbase's APIs
-- require 'instance_admin' for bucket/settings/migration access.
-- This migration recreates the function with the correct mapping.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    user_role text;
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM user_profiles LIMIT 1) THEN 'admin'
        WHEN new.user_metadata->>'role' = 'reader' THEN 'reader'
        ELSE 'user'
    END INTO user_role;

    INSERT INTO user_profiles (id, role)
    VALUES (new.id, user_role)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO user_preferences (id)
    VALUES (new.id)
    ON CONFLICT (id) DO NOTHING;

    -- Sync role to auth.users for JWT claims.
    -- user_profiles uses Wayli terms (admin/user/reader/moderator).
    -- auth.users uses Fluxbase terms (instance_admin/authenticated).
    -- The sync_user_role_to_auth trigger on user_profiles ALSO sets this,
    -- but handle_new_user's explicit UPDATE runs after the trigger and
    -- takes the final value, so it must use the correct Fluxbase term.
    UPDATE auth.users SET role = CASE
        WHEN user_role = 'admin' THEN 'instance_admin'
        ELSE 'authenticated'
    END WHERE id = new.id;

    RETURN new;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$;

-- Fix any existing users where the role wasn't synced correctly
UPDATE auth.users SET role = 'instance_admin'
WHERE id IN (SELECT id FROM user_profiles WHERE role = 'admin')
  AND role != 'instance_admin';
