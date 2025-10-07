-- Add is_setup_complete flag to server_settings table
-- This tracks whether the initial setup (first user registration) has been completed

ALTER TABLE "public"."server_settings"
ADD COLUMN IF NOT EXISTS "is_setup_complete" boolean DEFAULT false;

COMMENT ON COLUMN "public"."server_settings"."is_setup_complete" IS 'Indicates whether initial setup (first user registration) has been completed';
