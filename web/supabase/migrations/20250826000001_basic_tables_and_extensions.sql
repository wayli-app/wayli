-- Basic Tables and Extensions Migration
-- This migration creates the core database extensions and basic application tables

-- Enable required extensions
CREATE SCHEMA IF NOT EXISTS gis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA gis;
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA gis;

SET search_path TO public, gis;

-- Create trips table
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    image_url TEXT, -- Supabase Storage image URL for trip image
    labels TEXT[] DEFAULT '{}', -- Array of string labels for trip categorization
    metadata JSONB, -- Trip metadata including distance traveled and visited places count
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add constraint to allow 'pending' status for suggested trips
DO $$
BEGIN
    SET search_path = public, gis;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'trips_status_check'
        AND conrelid = 'public.trips'::regclass
    ) THEN
        ALTER TABLE public.trips
        ADD CONSTRAINT trips_status_check
        CHECK (status IN ('active', 'planned', 'completed', 'cancelled', 'pending', 'rejected'));
    END IF;
END $$;

-- Add comment explaining the status values
COMMENT ON COLUMN public.trips.status IS 'Trip status: active, planned, completed, cancelled, pending (suggested), rejected';
COMMENT ON COLUMN public.trips.labels IS 'Array of labels including "suggested" for trips created from suggestions';
COMMENT ON COLUMN public.trips.metadata IS 'Trip metadata including dataPoints, visitedCities, visitedCountries, etc.';

-- Create server_settings table for global server configuration
CREATE TABLE IF NOT EXISTS public.server_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_name TEXT DEFAULT 'Wayli',
    admin_email TEXT,
    allow_registration BOOLEAN DEFAULT true,
    require_email_verification BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create basic indexes for trips table
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON public.trips(start_date);
CREATE INDEX IF NOT EXISTS idx_trips_end_date ON public.trips(end_date);

-- Insert default settings if table is empty
INSERT INTO public.server_settings (server_name, admin_email, allow_registration, require_email_verification)
VALUES ('Wayli', 'support@wayli.app', true, false)
ON CONFLICT DO NOTHING;
