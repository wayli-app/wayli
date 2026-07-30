-- 033: Security hardening — username format constraint + column-level update guard

-- ============================================================
-- 1. Username format CHECK constraint (defense-in-depth)
--    Client validates, but this prevents direct API bypass
-- ============================================================
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_username_format_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_username_format_check
    CHECK (username IS NULL OR username ~ '^[a-z0-9-]{3,30}$');

-- ============================================================
-- 2. Prevent users from escalating their own role via updateProfile
--    The RLS UPDATE policy allows user_id = auth.uid() on ALL columns.
--    A modified client could send role='admin'. This trigger blocks it.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only allow role changes when the requester is the system (service_role)
    -- or when the role is being set by the initial-user trigger (INSERT path).
    -- For UPDATEs by authenticated users, preserve the existing role.
    IF TG_OP = 'UPDATE' THEN
        -- Check if the current user is trying to change their role
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            -- Allow if the current role is 'admin' (admins can manage roles)
            -- or if called by service_role (auth.role() = 'service_role')
            DECLARE
                current_role text;
            BEGIN
                SELECT role INTO current_role FROM user_profiles WHERE id = auth.uid();
                IF current_role IS DISTINCT FROM 'admin' AND auth.role() IS DISTINCT FROM 'service_role' THEN
                    -- Non-admin trying to change role — block it
                    NEW.role := OLD.role;
                END IF;
            END;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_role_escalation ON user_profiles;
CREATE TRIGGER trigger_prevent_role_escalation
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION prevent_role_escalation();
