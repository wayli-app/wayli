-- Initial data for storage buckets and server settings

-- Insert storage buckets
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('exports', 'exports', NULL, NOW(), NOW(), false, false, 2147483648, '{application/zip,application/json,application/gpx+xml,text/plain}', NULL, 'STANDARD'),
	('temp-files', 'temp-files', NULL, NOW(), NOW(), false, false, 2147483648, '{application/json,text/csv,application/gpx+xml,text/plain,application/octet-stream}', NULL, 'STANDARD'),
	('trip-images', 'trip-images', NULL, NOW(), NOW(), true, false, 2147483648, '{image/jpeg,image/png,image/gif,image/webp}', NULL, 'STANDARD')
ON CONFLICT (id) DO NOTHING;

-- Insert server settings
-- Note: Handles both old schema (with allow_registration, etc.) and new simplified schema
DO $$
BEGIN
  -- Check which columns exist to determine schema version
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'server_settings'
    AND column_name = 'allow_registration'
  ) THEN
    -- Old schema: insert with old fields (before migration 2025102401)
    INSERT INTO "public"."server_settings" ("id", "server_name", "admin_email", "allow_registration", "require_email_verification", "created_at", "updated_at") VALUES
      ('f37b0676-27ee-4fa7-b24a-d8744c807ad8', 'Wayli', 'support@wayli.app', true, false, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- New schema: insert with simplified fields (after migration 2025102401)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'server_settings'
      AND column_name = 'is_setup_complete'
    ) THEN
      -- With is_setup_complete column
      INSERT INTO "public"."server_settings" ("id", "server_name", "is_setup_complete", "created_at", "updated_at") VALUES
        ('f37b0676-27ee-4fa7-b24a-d8744c807ad8', 'Wayli', false, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    ELSE
      -- Without is_setup_complete column (shouldn't happen, but handle it)
      INSERT INTO "public"."server_settings" ("id", "server_name", "created_at", "updated_at") VALUES
        ('f37b0676-27ee-4fa7-b24a-d8744c807ad8', 'Wayli', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END IF;
END $$;
