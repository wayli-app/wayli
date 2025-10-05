-- Initial data for storage buckets and server settings

-- Insert storage buckets
INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('exports', 'exports', NULL, NOW(), NOW(), false, false, 2147483648, '{application/zip,application/json,application/gpx+xml,text/plain}', NULL, 'STANDARD'),
	('temp-files', 'temp-files', NULL, NOW(), NOW(), false, false, 2147483648, '{application/json,text/csv,application/gpx+xml,text/plain,application/octet-stream}', NULL, 'STANDARD'),
	('trip-images', 'trip-images', NULL, NOW(), NOW(), true, false, 2147483648, '{image/jpeg,image/png,image/gif,image/webp}', NULL, 'STANDARD')
ON CONFLICT (id) DO NOTHING;

-- Insert server settings
INSERT INTO "public"."server_settings" ("id", "server_name", "admin_email", "allow_registration", "require_email_verification", "created_at", "updated_at") VALUES
	('f37b0676-27ee-4fa7-b24a-d8744c807ad8', 'Wayli', 'support@wayli.app', true, false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
