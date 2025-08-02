-- Migration: Refactor trip suggestions to use trips table with status='pending'
-- This removes the need for a separate suggested_trips table

-- First, migrate existing suggested trips to the trips table
INSERT INTO public.trips (
    id,
    user_id,
    title,
    description,
    start_date,
    end_date,
    status,
    image_url,
    labels,
    metadata,
    created_at,
    updated_at
)
SELECT
    id,
    user_id,
    title,
    description,
    start_date,
    end_date,
    CASE
        WHEN status = 'approved' THEN 'active'
        WHEN status = 'rejected' THEN 'rejected'
        ELSE 'pending'
    END as status,
    image_url,
    ARRAY['suggested'] as labels,
    jsonb_build_object(
        'suggested_from', id,
        'point_count', data_points,
        'distance_traveled', distance_from_home,
        'visited_places_count', data_points,
        'overnight_stays', overnight_stays,
        'location', ST_AsGeoJSON(location)::jsonb,
        'city_name', city_name,
        'confidence', confidence,
        'suggested', true,
        'image_attribution', metadata->>'image_attribution'
    ) as metadata,
    created_at,
    updated_at
FROM public.suggested_trips
WHERE status IN ('pending', 'approved', 'rejected');

-- Update the trips table to allow 'pending' and 'rejected' status values
ALTER TABLE public.trips
DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE public.trips
ADD CONSTRAINT trips_status_check
CHECK (status IN ('active', 'planned', 'completed', 'cancelled', 'pending', 'rejected'));

-- Drop the suggested_trips table and related objects
DROP TABLE IF EXISTS public.suggested_trips CASCADE;

-- Drop the image_generation_jobs table as it's no longer needed
DROP TABLE IF EXISTS public.image_generation_jobs CASCADE;

-- Add comment to trips table to document the new status values
COMMENT ON COLUMN public.trips.status IS 'Trip status: active, planned, completed, cancelled, pending (suggested), rejected';
COMMENT ON COLUMN public.trips.labels IS 'Array of labels including "suggested" for trips created from suggestions';
COMMENT ON COLUMN public.trips.metadata IS 'Trip metadata including suggested_from, point_count, distance_traveled, etc.';