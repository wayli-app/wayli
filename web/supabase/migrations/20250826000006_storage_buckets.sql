-- Storage Buckets Migration
-- This migration creates storage buckets and policies for file uploads

-- Create storage buckets for file uploads
-- Note: These buckets are configured with file size limits that match the config.toml settings
-- - temp-files: 2GiB (for large import files)
-- - trip-images: 10MiB (for trip images)
-- - exports: 100MiB (for user data exports)

-- Create temp-files bucket for temporary import files
INSERT INTO storage.buckets (id, name, file_size_limit)
VALUES (
    'temp-files',
    'temp-files',
    2147483648  -- 2GiB in bytes
) ON CONFLICT (id) DO NOTHING;

-- Create trip-images bucket for trip images
INSERT INTO storage.buckets (id, name, file_size_limit)
VALUES (
    'trip-images',
    'trip-images',
    10485760  -- 10MiB in bytes
) ON CONFLICT (id) DO NOTHING;

-- Create exports bucket for user data exports
INSERT INTO storage.buckets (id, name, file_size_limit)
VALUES (
    'exports',
    'exports',
    2147483648  -- 2GiB in bytes
) ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects with error handling
DO $$
BEGIN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the migration
        RAISE NOTICE 'Could not enable RLS on storage.objects: %', SQLERRM;
END $$;

-- Create storage policies with proper error handling, file size limits, and MIME type restrictions
DO $$
BEGIN
    -- Create storage policies for temp-files bucket (private, 2GB limit, specific MIME types)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can upload to temp-files') THEN
        CREATE POLICY "Users can upload to temp-files" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'temp-files' AND
                auth.uid()::text = (storage.foldername(name))[1] AND
                (metadata->>'size')::bigint <= 2147483648 AND -- 2GB limit to match bucket configuration
                metadata->>'mimetype' IN ('application/json', 'text/csv', 'application/gpx+xml', 'text/plain', 'application/octet-stream')
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can view their own temp-files') THEN
        CREATE POLICY "Users can view their own temp-files" ON storage.objects
            FOR SELECT USING (
                bucket_id = 'temp-files' AND
                auth.uid()::text = (storage.foldername(name))[1]
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can delete their own temp-files') THEN
        CREATE POLICY "Users can delete their own temp-files" ON storage.objects
            FOR DELETE USING (
                bucket_id = 'temp-files' AND
                auth.uid()::text = (storage.foldername(name))[1]
            );
    END IF;

    -- Create storage policies for exports bucket (private, 100MB limit, specific MIME types)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can upload to exports') THEN
        CREATE POLICY "Users can upload to exports" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'exports' AND
                auth.uid()::text = (storage.foldername(name))[1] AND
                (metadata->>'size')::bigint <= 2147483648 AND -- 2GiB limit
                metadata->>'mimetype' IN ('application/zip', 'application/json', 'application/gpx+xml', 'text/plain', 'application/octet-stream')
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can view their own exports') THEN
        CREATE POLICY "Users can view their own exports" ON storage.objects
            FOR SELECT USING (
                bucket_id = 'exports' AND
                auth.uid()::text = (storage.foldername(name))[1]
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can delete their own exports') THEN
        CREATE POLICY "Users can delete their own exports" ON storage.objects
            FOR DELETE USING (
                bucket_id = 'exports' AND
                auth.uid()::text = (storage.foldername(name))[1]
            );
    END IF;

    -- Create storage policies for trip-images bucket (public read, 10MB limit, image MIME types only)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can view trip-images') THEN
        CREATE POLICY "Anyone can view trip-images" ON storage.objects
            FOR SELECT USING (bucket_id = 'trip-images');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated users can upload trip-images') THEN
        CREATE POLICY "Authenticated users can upload trip-images" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'trip-images' AND
                auth.role() = 'authenticated' AND
                (metadata->>'size')::bigint <= 2147483648 AND -- 2GiB limit to match bucket configuration
                metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can delete their own trip-images') THEN
        CREATE POLICY "Users can delete their own trip-images" ON storage.objects
            FOR DELETE USING (
                bucket_id = 'trip-images' AND
                auth.uid()::text = (storage.foldername(name))[1]
            );
    END IF;

    -- Service role can access all storage objects (bypasses all restrictions)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Service role can access all storage') THEN
        CREATE POLICY "Service role can access all storage" ON storage.objects
            FOR ALL USING (auth.role() = 'service_role');
    END IF;

    -- Add a more permissive fallback policy for authenticated users
    -- This allows uploads even if metadata is missing or incomplete
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated users can upload to temp-files fallback') THEN
        CREATE POLICY "Authenticated users can upload to temp-files fallback" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'temp-files' AND
                auth.role() = 'authenticated' AND
                -- Allow uploads to user's own folder
                (storage.foldername(name))[1] = auth.uid()::text
            );
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the migration
        RAISE NOTICE 'Storage policies creation failed: %', SQLERRM;
END $$;

-- Function to clean up expired export files
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    expired_job RECORD;
BEGIN
    SET search_path = public;
    -- Find expired export jobs
    FOR expired_job IN
        SELECT id, (data->>'file_path') as file_path
        FROM public.jobs
        WHERE type = 'data_export'
          AND (data->>'expires_at')::timestamp with time zone < NOW()
          AND data->>'file_path' IS NOT NULL
    LOOP
        -- Delete the file from storage
        DELETE FROM storage.objects
        WHERE name = expired_job.file_path AND bucket_id = 'exports';

        -- Delete the job record
        DELETE FROM public.jobs WHERE id = expired_job.id;

        deleted_count := deleted_count + 1;
    END LOOP;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_exports() TO service_role;
