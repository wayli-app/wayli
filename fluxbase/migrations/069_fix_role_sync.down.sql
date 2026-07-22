-- Revert: old sync function (maps admin → admin, which doesn't work with Fluxbase APIs)
CREATE OR REPLACE FUNCTION public.sync_user_role_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
    UPDATE "auth"."users"
    SET "role" = CASE
        WHEN NEW."role" = 'admin' THEN 'admin'
        ELSE 'authenticated'
    END
    WHERE "id" = NEW."id";
    RETURN NEW;
END;
$function$;
