-- Initial data for storage buckets and server settings

-- Insert storage buckets
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('exports', 'exports', NULL, NOW(), NOW(), false, false, 2147483648, '{application/zip,application/json,application/gpx+xml,text/plain}', NULL, 'STANDARD'),
	('temp-files', 'temp-files', NULL, NOW(), NOW(), false, false, 2147483648, '{application/json,text/csv,application/gpx+xml,text/plain,application/octet-stream}', NULL, 'STANDARD'),
	('trip-images', 'trip-images', NULL, NOW(), NOW(), true, false, 2147483648, '{image/jpeg,image/png,image/gif,image/webp}', NULL, 'STANDARD')
ON CONFLICT (id) DO NOTHING;

-- Insert server settings (note: is_setup_complete is added by a later migration)
INSERT INTO "public"."server_settings" ("id", "server_name", "admin_email", "allow_registration", "require_email_verification", "created_at", "updated_at") VALUES
	('f37b0676-27ee-4fa7-b24a-d8744c807ad8', 'Wayli', 'support@wayli.app', true, false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Update is_setup_complete to false if it exists (will be set after first migration adds the column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'server_settings'
    AND column_name = 'is_setup_complete'
  ) THEN
    UPDATE "public"."server_settings" SET "is_setup_complete" = false WHERE "id" = 'f37b0676-27ee-4fa7-b24a-d8744c807ad8';
  END IF;
END $$;
