-- Simplify server_settings table to only keep server_name and is_setup_complete
-- Remove allow_registration, require_email_verification (now handled by Supabase Auth config)
-- Remove admin_email (no longer needed)

ALTER TABLE "public"."server_settings"
DROP COLUMN IF EXISTS "allow_registration",
DROP COLUMN IF EXISTS "require_email_verification",
DROP COLUMN IF EXISTS "admin_email";

COMMENT ON TABLE "public"."server_settings" IS 'Server configuration settings - minimal set for custom branding and setup state';
COMMENT ON COLUMN "public"."server_settings"."server_name" IS 'Custom server/instance name for branding';
COMMENT ON COLUMN "public"."server_settings"."is_setup_complete" IS 'Indicates whether initial setup (first user registration) has been completed';
