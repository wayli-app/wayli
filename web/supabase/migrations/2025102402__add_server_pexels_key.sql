-- Add server-level Pexels API key to server_settings table
-- This allows admins to configure a server-wide Pexels API key through the admin UI

ALTER TABLE "public"."server_settings"
ADD COLUMN IF NOT EXISTS "server_pexels_api_key" TEXT DEFAULT NULL;

COMMENT ON COLUMN "public"."server_settings"."server_pexels_api_key" IS 'Server-level Pexels API key for trip image suggestions. Falls back to this if user has no personal key configured.';
