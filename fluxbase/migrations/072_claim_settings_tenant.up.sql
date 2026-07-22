-- Fix handle_new_user: claim NULL-tenant settings for the first user's tenant.
-- Migration 008 seeds default settings with tenant_id = NULL (no tenant exists
-- at migration time). When the first user signs up, their tenant is created,
-- but the seeded settings remain on NULL tenant_id. RLS then blocks access
-- because has_tenant_access compares the setting's NULL tenant against the
-- user's real tenant_id.
--
-- Fix: when creating the first user's profile, update all NULL-tenant
-- settings to the new user's tenant_id so they become accessible.
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
    UPDATE auth.users SET role = CASE
        WHEN user_role = 'admin' THEN 'instance_admin'
        ELSE 'authenticated'
    END WHERE id = new.id;

    -- Claim NULL-tenant settings for this user's tenant so RLS allows access.
    -- Only runs for the first user (when user_role = 'admin'). Subsequent
    -- users get 'user' role and the settings already have a tenant_id.
    IF user_role = 'admin' AND new.tenant_id IS NOT NULL THEN
        UPDATE app.settings SET tenant_id = new.tenant_id WHERE tenant_id IS NULL;
    END IF;

    RETURN new;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$;
