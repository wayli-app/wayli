-- Add storage policies for file uploads
-- This migration adds the missing RLS policies for storage buckets

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create storage policies for temp-files bucket
CREATE POLICY "Users can upload to temp-files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'temp-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their own temp-files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'temp-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their own temp-files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'temp-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Create storage policies for exports bucket
CREATE POLICY "Users can upload to exports" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'exports' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their own exports" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'exports' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their own exports" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'exports' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Create storage policies for trip-images bucket (public read, authenticated upload)
CREATE POLICY "Anyone can view trip-images" ON storage.objects
    FOR SELECT USING (bucket_id = 'trip-images');

CREATE POLICY "Authenticated users can upload trip-images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'trip-images' AND
        auth.role() = 'authenticated'
    );

CREATE POLICY "Users can delete their own trip-images" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'trip-images' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Service role can access all storage objects
CREATE POLICY "Service role can access all storage" ON storage.objects
    FOR ALL USING (auth.role() = 'service_role');