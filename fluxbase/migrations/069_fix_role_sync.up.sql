-- Fix role sync: user_profiles.role 'admin' must map to auth.users.role 'instance_admin'
-- (Fluxbase's term for admin API access). The old mapping used 'admin' which Fluxbase's
-- storage/settings/migration APIs don't recognize — they check for 'instance_admin'.
CREATE OR REPLACE FUNCTION public.sync_user_role_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
    -- Update the role in auth.users to match user_profiles
    -- admin (Wayli term) → instance_admin (Fluxbase term for API access)
    -- user → authenticated (standard role)
    -- reader → authenticated (read-only in Wayli, standard auth role for Fluxbase)
    -- moderator → authenticated (Wayli-specific, standard auth for Fluxbase)
    UPDATE "auth"."users"
    SET "role" = CASE
        WHEN NEW."role" = 'admin' THEN 'instance_admin'
        ELSE 'authenticated'
    END
    WHERE "id" = NEW."id";

    RAISE NOTICE 'Synced role % to auth.users for user %', NEW."role", NEW."id";
    RETURN NEW;
END;
$function$;

-- Fix existing admin users: set their auth.users role to 'instance_admin'
UPDATE "auth"."users"
SET "role" = 'instance_admin'
WHERE "id" IN (SELECT "id" FROM "user_profiles" WHERE "role" = 'admin')
  AND "role" != 'instance_admin';
