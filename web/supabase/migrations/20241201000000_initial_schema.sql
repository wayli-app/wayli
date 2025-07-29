-- Wayli Database Setup Script with PostGIS
-- Run this script in your Supabase SQL editor to create the necessary tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";



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





-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light',
    language TEXT DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT true,
    timezone TEXT DEFAULT 'UTC+00:00 (London, Dublin)',
    pexels_api_key TEXT,
    trip_exclusions JSONB DEFAULT '[]', -- Array of trip exclusion objects
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
    avatar_url TEXT,
    home_address JSONB, -- Store geocoded location data
    geocoding_stats JSONB DEFAULT '{}', -- Cached geocoding statistics to avoid expensive recalculations
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN public.user_profiles.two_factor_secret IS 'TOTP secret for 2FA authentication';
COMMENT ON COLUMN public.user_profiles.two_factor_recovery_codes IS 'Array of recovery codes for 2FA backup';
COMMENT ON COLUMN public.user_profiles.geocoding_stats IS 'Cached geocoding statistics to avoid expensive recalculations';

-- Create tracker_data table for OwnTracks and other tracking apps
CREATE TABLE IF NOT EXISTS public.tracker_data (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tracker_type TEXT NOT NULL, -- 'owntracks', 'gpx', 'fitbit', etc.
    device_id TEXT, -- Device identifier from tracking app
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID
    country_code VARCHAR(2), -- ISO 3166-1 alpha-2 country code
    altitude DECIMAL(8, 2), -- Altitude in meters
    accuracy DECIMAL(8, 2), -- GPS accuracy in meters
    speed DECIMAL(8, 2), -- Speed in m/s
    heading DECIMAL(5, 2), -- Heading in degrees (0-360)
    battery_level INTEGER, -- Battery level percentage
    is_charging BOOLEAN,
    activity_type TEXT, -- 'walking', 'driving', 'cycling', etc.
    raw_data JSONB, -- Store original data from tracking app
    geocode JSONB, -- Store geocoded data from Nominatim
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, location, recorded_at)
);

-- Create jobs table for background job processing
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    data JSONB NOT NULL DEFAULT '{}',
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    result JSONB,
    error TEXT,
    last_error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    worker_id TEXT
);

-- Add comment for retry_count documentation
COMMENT ON COLUMN public.jobs.retry_count IS 'Number of retry attempts for this job';

-- Create workers table for worker management
CREATE TABLE IF NOT EXISTS public.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'stopped')),
    current_job UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create poi_visit_logs table for detailed visit records
CREATE TABLE IF NOT EXISTS public.poi_visit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_start TIMESTAMP WITH TIME ZONE NOT NULL,
    visit_end TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    visit_type TEXT DEFAULT 'detected' CHECK (visit_type IN ('detected', 'manual', 'confirmed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, visit_start) -- Prevent duplicate visits for same POI at same time
);

-- Create audit_logs table for security monitoring
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Create suggested_trips table for trip review workflow
CREATE TABLE IF NOT EXISTS public.suggested_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location GEOMETRY(POINT, 4326) NOT NULL,
    city_name TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    data_points INTEGER NOT NULL DEFAULT 0,
    overnight_stays INTEGER NOT NULL DEFAULT 0,
    distance_from_home DECIMAL(10,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'created')),
    metadata JSONB DEFAULT '{}',
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create image_generation_jobs table for rate-limited image generation
CREATE TABLE IF NOT EXISTS public.image_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggested_trip_id UUID REFERENCES public.suggested_trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    city_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    priority INTEGER NOT NULL DEFAULT 1,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    image_url TEXT
);

-- Create indexes for better performance

CREATE INDEX IF NOT EXISTS idx_trips_user_id ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON public.trips(start_date);
CREATE INDEX IF NOT EXISTS idx_trips_end_date ON public.trips(end_date);

CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_user_id ON public.poi_visit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_visit_start ON public.poi_visit_logs(visit_start);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_visit_end ON public.poi_visit_logs(visit_end);
CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON public.user_preferences(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_geocoding_stats ON public.user_profiles USING GIN (geocoding_stats);
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_id ON public.tracker_data(user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_timestamp ON public.tracker_data(recorded_at);
CREATE INDEX IF NOT EXISTS idx_tracker_data_device_id ON public.tracker_data(device_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON public.jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_worker_id ON public.jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON public.workers(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_workers_updated_at ON public.workers(updated_at);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON public.audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON public.audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type_timestamp ON public.audit_logs(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_timestamp ON public.audit_logs(severity, timestamp DESC);

-- Create indexes for enhanced trip detection tables
CREATE INDEX IF NOT EXISTS idx_suggested_trips_user_id ON public.suggested_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_suggested_trips_status ON public.suggested_trips(status);
CREATE INDEX IF NOT EXISTS idx_suggested_trips_dates ON public.suggested_trips(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_suggested_trips_location ON public.suggested_trips USING GIST(location);

CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_user_id ON public.image_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_status ON public.image_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_priority ON public.image_generation_jobs(priority, created_at);
CREATE INDEX IF NOT EXISTS idx_image_generation_jobs_suggested_trip ON public.image_generation_jobs(suggested_trip_id);

-- Create spatial indexes for PostGIS
CREATE INDEX IF NOT EXISTS idx_tracker_data_location ON public.tracker_data USING GIST(location);

-- Enable RLS on all tables
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggested_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all tables

-- Create RLS policies for trips table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can view their own trips') THEN
        CREATE POLICY "Users can view their own trips" ON public.trips
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can insert their own trips') THEN
        CREATE POLICY "Users can insert their own trips" ON public.trips
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can update their own trips') THEN
        CREATE POLICY "Users can update their own trips" ON public.trips
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can delete their own trips') THEN
        CREATE POLICY "Users can delete their own trips" ON public.trips
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create RLS policies for POI visit logs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can view their own POI visit logs') THEN
        CREATE POLICY "Users can view their own POI visit logs" ON public.poi_visit_logs
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can insert their own POI visit logs') THEN
        CREATE POLICY "Users can insert their own POI visit logs" ON public.poi_visit_logs
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can update their own POI visit logs') THEN
        CREATE POLICY "Users can update their own POI visit logs" ON public.poi_visit_logs
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can delete their own POI visit logs') THEN
        CREATE POLICY "Users can delete their own POI visit logs" ON public.poi_visit_logs
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create RLS policies for user_preferences table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'Service role can access all preferences') THEN
        CREATE POLICY "Service role can access all preferences" ON public.user_preferences
            FOR ALL USING (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'Users can view their own preferences') THEN
        CREATE POLICY "Users can view their own preferences" ON public.user_preferences
            FOR SELECT USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'Users can insert their own preferences') THEN
        CREATE POLICY "Users can insert their own preferences" ON public.user_preferences
            FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'Users can update their own preferences') THEN
        CREATE POLICY "Users can update their own preferences" ON public.user_preferences
            FOR UPDATE USING (auth.uid() = id);
    END IF;
END $$;

-- Create RLS policies for user_profiles table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'Users can view their own profile') THEN
        CREATE POLICY "Users can view their own profile" ON public.user_profiles
            FOR SELECT USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'Users can update their own profile') THEN
        CREATE POLICY "Users can update their own profile" ON public.user_profiles
            FOR UPDATE USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'Users can insert their own profile') THEN
        CREATE POLICY "Users can insert their own profile" ON public.user_profiles
            FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'Service role can access all profiles') THEN
        CREATE POLICY "Service role can access all profiles" ON public.user_profiles
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- Create RLS policies for tracker_data table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can view their own tracker data') THEN
        CREATE POLICY "Users can view their own tracker data" ON public.tracker_data
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can insert their own tracker data') THEN
        CREATE POLICY "Users can insert their own tracker data" ON public.tracker_data
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can update their own tracker data') THEN
        CREATE POLICY "Users can update their own tracker data" ON public.tracker_data
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can delete their own tracker data') THEN
        CREATE POLICY "Users can delete their own tracker data" ON public.tracker_data
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create RLS policies for jobs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can view their own jobs') THEN
        CREATE POLICY "Users can view their own jobs" ON public.jobs
            FOR SELECT USING (auth.uid()::uuid = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can insert their own jobs') THEN
        CREATE POLICY "Users can insert their own jobs" ON public.jobs
            FOR INSERT WITH CHECK (auth.uid()::uuid = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can update their own jobs') THEN
        CREATE POLICY "Users can update their own jobs" ON public.jobs
            FOR UPDATE USING (auth.uid()::uuid = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can delete their own jobs') THEN
        CREATE POLICY "Users can delete their own jobs" ON public.jobs
            FOR DELETE USING (auth.uid()::uuid = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Allow service role to update jobs') THEN
        CREATE POLICY "Allow service role to update jobs" ON public.jobs
            FOR UPDATE USING (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Workers can update jobs') THEN
        CREATE POLICY "Workers can update jobs" ON public.jobs
            FOR UPDATE USING (
                auth.role() = 'service_role' OR
                EXISTS (
                    SELECT 1 FROM public.workers
                    WHERE id = auth.uid()::uuid
                )
            );
    END IF;
END $$;

-- Create RLS policies for audit_logs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Users can view their own audit logs') THEN
        CREATE POLICY "Users can view their own audit logs" ON public.audit_logs
            FOR SELECT USING (
                auth.uid() = user_id OR
                auth.role() = 'service_role' OR
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE id = auth.uid() AND role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Admins can view all audit logs') THEN
        CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE id = auth.uid() AND role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Service role can insert audit logs') THEN
        CREATE POLICY "Service role can insert audit logs" ON public.audit_logs
            FOR INSERT WITH CHECK (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Service role can update audit logs') THEN
        CREATE POLICY "Service role can update audit logs" ON public.audit_logs
            FOR UPDATE USING (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Service role can delete audit logs') THEN
        CREATE POLICY "Service role can delete audit logs" ON public.audit_logs
            FOR DELETE USING (auth.role() = 'service_role');
    END IF;
END $$;

-- Create policy to allow admins to read and update server settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'server_settings' AND schemaname = 'public' AND policyname = 'Admins can manage server settings') THEN
        CREATE POLICY "Admins can manage server settings" ON public.server_settings
            FOR ALL USING (
                auth.role() = 'service_role' OR
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE id = auth.uid() AND role = 'admin'
                )
            );
    END IF;
END $$;

-- Create RLS policies for suggested_trips table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suggested_trips' AND schemaname = 'public' AND policyname = 'Users can view their own suggested trips') THEN
        CREATE POLICY "Users can view their own suggested trips" ON public.suggested_trips
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suggested_trips' AND schemaname = 'public' AND policyname = 'Users can update their own suggested trips') THEN
        CREATE POLICY "Users can update their own suggested trips" ON public.suggested_trips
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suggested_trips' AND schemaname = 'public' AND policyname = 'Users can insert their own suggested trips') THEN
        CREATE POLICY "Users can insert their own suggested trips" ON public.suggested_trips
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suggested_trips' AND schemaname = 'public' AND policyname = 'Users can delete their own suggested trips') THEN
        CREATE POLICY "Users can delete their own suggested trips" ON public.suggested_trips
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create RLS policies for image_generation_jobs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_generation_jobs' AND schemaname = 'public' AND policyname = 'Users can view their own image generation jobs') THEN
        CREATE POLICY "Users can view their own image generation jobs" ON public.image_generation_jobs
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_generation_jobs' AND schemaname = 'public' AND policyname = 'Users can update their own image generation jobs') THEN
        CREATE POLICY "Users can update their own image generation jobs" ON public.image_generation_jobs
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_generation_jobs' AND schemaname = 'public' AND policyname = 'Users can insert their own image generation jobs') THEN
        CREATE POLICY "Users can insert their own image generation jobs" ON public.image_generation_jobs
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'image_generation_jobs' AND schemaname = 'public' AND policyname = 'Users can delete their own image generation jobs') THEN
        CREATE POLICY "Users can delete their own image generation jobs" ON public.image_generation_jobs
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Insert default settings if table is empty
INSERT INTO public.server_settings (server_name, admin_email, allow_registration, require_email_verification)
VALUES ('Wayli', NULL, true, false)
ON CONFLICT DO NOTHING;

-- Function to handle new user creation and assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_count INTEGER;
    user_role TEXT;
    updated_metadata JSONB;
    first_name TEXT;
    last_name TEXT;
    full_name TEXT;
BEGIN
    -- Count existing users
    SELECT COUNT(*) INTO user_count FROM auth.users;

    -- Set role based on user count
    IF user_count = 1 THEN
        user_role := 'admin';
    ELSE
        user_role := 'user';
    END IF;

    -- Extract name information from user metadata
    first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

    -- Build full name if not provided
    IF full_name = '' AND (first_name != '' OR last_name != '') THEN
        IF first_name != '' AND last_name != '' THEN
            full_name := first_name || ' ' || last_name;
        ELSIF first_name != '' THEN
            full_name := first_name;
        ELSIF last_name != '' THEN
            full_name := last_name;
        END IF;
    END IF;

    -- Clean up names (remove extra spaces, etc.)
    first_name := TRIM(first_name);
    last_name := TRIM(last_name);
    full_name := TRIM(full_name);

    -- Update user metadata with role and cleaned names
    updated_metadata := NEW.raw_user_meta_data;
    updated_metadata := updated_metadata || jsonb_build_object(
        'role', user_role,
        'first_name', first_name,
        'last_name', last_name,
        'full_name', full_name
    );

    -- Update the user's metadata
    UPDATE auth.users
    SET raw_user_meta_data = updated_metadata
    WHERE id = NEW.id;

    -- Insert into user_profiles table
    INSERT INTO public.user_profiles (
        id,
        first_name,
        last_name,
        full_name,
        role,
        geocoding_stats,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        first_name,
        last_name,
        full_name,
        user_role,
        jsonb_build_object(
            'total_points', 0,
            'geocoded_points', 0,
            'points_needing_geocoding', 0,
            'null_or_empty_geocodes', 0,
            'retryable_errors', 0,
            'non_retryable_errors', 0,
            'last_calculated', NOW()::TEXT,
            'cache_version', '1.0'
        ),
        NOW(),
        NOW()
    );

    -- Insert into user_preferences table
    INSERT INTO public.user_preferences (
        id,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NOW(),
        NOW()
    );

    -- Temporarily comment out audit logging to isolate the issue
    -- PERFORM log_audit_event(
    --     'user_registered',
    --     'New user registered: ' || NEW.email,
    --     'low',
    --     jsonb_build_object(
    --         'user_id', NEW.id,
    --         'email', NEW.email,
    --         'role', user_role,
    --         'first_name', first_name,
    --         'last_name', last_name,
    --         'full_name', full_name
    --     )
    -- );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- Function to update workers updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update workers updated_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_workers_updated_at') THEN
        CREATE TRIGGER update_workers_updated_at
            BEFORE UPDATE ON public.workers
            FOR EACH ROW EXECUTE FUNCTION public.update_workers_updated_at();
    END IF;
END $$;

-- Function to automatically clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.audit_logs
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get audit statistics
CREATE OR REPLACE FUNCTION get_audit_statistics(
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    total_events BIGINT,
    events_by_type JSONB,
    events_by_severity JSONB,
    events_by_user JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            COUNT(*) as total_events,
            jsonb_object_agg(event_type, count) as events_by_type,
            jsonb_object_agg(severity, count) as events_by_severity,
            jsonb_object_agg(user_id::text, count) as events_by_user
        FROM (
            SELECT
                event_type,
                severity,
                user_id,
                COUNT(*) as count
            FROM public.audit_logs
            WHERE (start_date IS NULL OR timestamp >= start_date)
              AND (end_date IS NULL OR timestamp <= end_date)
            GROUP BY event_type, severity, user_id
        ) grouped_stats
    )
    SELECT
        COALESCE(stats.total_events, 0),
        COALESCE(stats.events_by_type, '{}'::jsonb),
        COALESCE(stats.events_by_severity, '{}'::jsonb),
        COALESCE(stats.events_by_user, '{}'::jsonb)
    FROM stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update audit_logs updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_audit_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update audit_logs updated_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_audit_logs_updated_at') THEN
        CREATE TRIGGER update_audit_logs_updated_at
            BEFORE UPDATE ON public.audit_logs
            FOR EACH ROW EXECUTE FUNCTION public.update_audit_logs_updated_at();
    END IF;
END $$;

-- Create a view for recent security events
CREATE OR REPLACE VIEW public.recent_security_events AS
SELECT
    al.id,
    al.user_id,
    al.event_type,
    al.severity,
    al.description,
    al.ip_address,
    al.timestamp,
    up.full_name as user_name,
    au.email as user_email
FROM public.audit_logs al
LEFT JOIN public.user_profiles up ON al.user_id = up.id
LEFT JOIN auth.users au ON al.user_id = au.id
WHERE al.severity IN ('high', 'critical')
  AND al.timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY al.timestamp DESC;

-- Create a function to log audit events from triggers
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event_type TEXT,
    p_description TEXT,
    p_severity TEXT DEFAULT 'low',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        event_type,
        severity,
        description,
        metadata,
        timestamp
    ) VALUES (
        auth.uid(),
        p_event_type,
        p_severity,
        p_description,
        p_metadata,
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for user role changes
CREATE OR REPLACE FUNCTION audit_user_role_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        PERFORM log_audit_event(
            'user_role_change',
            format('User role changed from %s to %s', OLD.role, NEW.role),
            'high',
            jsonb_build_object(
                'user_id', NEW.id,
                'old_role', OLD.role,
                'new_role', NEW.role
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user role change auditing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_user_role_change_trigger') THEN
        CREATE TRIGGER audit_user_role_change_trigger
            AFTER UPDATE ON public.user_profiles
            FOR EACH ROW EXECUTE FUNCTION audit_user_role_change();
    END IF;
END $$;

-- Function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_events BIGINT,
    events_by_type JSONB,
    events_by_severity JSONB,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_events,
        jsonb_object_agg(event_type, count) as events_by_type,
        jsonb_object_agg(severity, count) as events_by_severity,
        MAX(timestamp) as last_activity
    FROM (
        SELECT
            event_type,
            severity,
            COUNT(*) as count
        FROM public.audit_logs
        WHERE user_id = p_user_id
          AND timestamp >= NOW() - INTERVAL '1 day' * p_days
        GROUP BY event_type, severity
    ) user_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON public.recent_security_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO service_role;
GRANT UPDATE ON public.audit_logs TO service_role;
GRANT DELETE ON public.audit_logs TO service_role;

-- Function to get points within a radius
CREATE OR REPLACE FUNCTION get_points_within_radius(
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    user_uuid UUID
)
RETURNS TABLE (
    user_id UUID,
    recorded_at TIMESTAMP WITH TIME ZONE,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.user_id,
        td.recorded_at,
        ST_Y(td.location::geometry) as lat,
        ST_X(td.location::geometry) as lon,
        ST_Distance(td.location, ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)) as distance_meters
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
      AND ST_DWithin(
          td.location,
          ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326),
          radius_meters
      )
    ORDER BY td.recorded_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user tracking data with optional filters
CREATE OR REPLACE FUNCTION get_user_tracking_data(
    user_uuid UUID,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    limit_count INTEGER DEFAULT 1000
)
RETURNS TABLE (
    user_id UUID,
    recorded_at TIMESTAMP WITH TIME ZONE,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    altitude DECIMAL(8, 2),
    accuracy DECIMAL(8, 2),
    speed DECIMAL(8, 2),
    activity_type TEXT,
    geocode JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.user_id,
        td.recorded_at,
        ST_Y(td.location::geometry) as lat,
        ST_X(td.location::geometry) as lon,
        td.altitude,
        td.accuracy,
        td.speed,
        td.activity_type,
        td.geocode
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
      AND (start_date IS NULL OR td.recorded_at >= start_date)
      AND (end_date IS NULL OR td.recorded_at <= end_date)
    ORDER BY td.recorded_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.user_profiles
    WHERE id = user_uuid;

    RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get server settings
CREATE OR REPLACE FUNCTION get_server_settings()
RETURNS TABLE (
    server_name TEXT,
    admin_email TEXT,
    allow_registration BOOLEAN,
    require_email_verification BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ss.server_name,
        ss.admin_email,
        ss.allow_registration,
        ss.require_email_verification
    FROM public.server_settings ss
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to authenticated users
GRANT SELECT ON public.server_settings TO authenticated;
GRANT EXECUTE ON FUNCTION get_server_settings() TO authenticated;

-- Function to update user_profiles updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update user_profiles updated_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at') THEN
        CREATE TRIGGER update_user_profiles_updated_at
            BEFORE UPDATE ON public.user_profiles
            FOR EACH ROW EXECUTE FUNCTION public.update_user_profiles_updated_at();
    END IF;
END $$;

-- Create function to update updated_at timestamp (if not already exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at on enhanced trip detection tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_suggested_trips_updated_at') THEN
        CREATE TRIGGER update_suggested_trips_updated_at
            BEFORE UPDATE ON public.suggested_trips
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- Create trigger to update image_generation_jobs updated_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_image_generation_jobs_updated_at') THEN
        CREATE TRIGGER update_image_generation_jobs_updated_at
            BEFORE UPDATE ON public.image_generation_jobs
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- Create storage buckets for file uploads
-- Create temp-files bucket for temporary import files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'temp-files',
    'temp-files',
    false,
    1073741824, -- 1GB in bytes
    ARRAY['application/json', 'text/csv', 'application/gpx+xml', 'text/plain', 'application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

-- Create trip-images bucket for trip images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'trip-images',
    'trip-images',
    true,
    10485760, -- 10MB in bytes
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create exports bucket for user data exports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exports',
    'exports',
    false,
    104857600, -- 100MB in bytes
    ARRAY['application/zip', 'application/json', 'application/gpx+xml', 'text/plain', 'application/octet-stream']
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

-- Create storage policies with proper error handling
DO $$
BEGIN
    -- Create storage policies for temp-files bucket
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can upload to temp-files') THEN
        CREATE POLICY "Users can upload to temp-files" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'temp-files' AND
                auth.uid()::text = (storage.foldername(name))[1]
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

    -- Create storage policies for exports bucket
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can upload to exports') THEN
        CREATE POLICY "Users can upload to exports" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'exports' AND
                auth.uid()::text = (storage.foldername(name))[1]
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

    -- Create storage policies for trip-images bucket (public read, authenticated upload)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Anyone can view trip-images') THEN
        CREATE POLICY "Anyone can view trip-images" ON storage.objects
            FOR SELECT USING (bucket_id = 'trip-images');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Authenticated users can upload trip-images') THEN
        CREATE POLICY "Authenticated users can upload trip-images" ON storage.objects
            FOR INSERT WITH CHECK (
                bucket_id = 'trip-images' AND
                auth.role() = 'authenticated'
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Users can delete their own trip-images') THEN
        CREATE POLICY "Users can delete their own trip-images" ON storage.objects
            FOR DELETE USING (
                bucket_id = 'trip-images' AND
                auth.uid()::text = (storage.foldername(name))[1]
            );
    END IF;

    -- Service role can access all storage objects
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Service role can access all storage') THEN
        CREATE POLICY "Service role can access all storage" ON storage.objects
            FOR ALL USING (auth.role() = 'service_role');
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the migration
        RAISE NOTICE 'Storage policies creation failed: %', SQLERRM;
END $$;

-- Create function to clean up expired export files
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    expired_job RECORD;
BEGIN
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

-- Create want_to_visit_places table
CREATE TABLE IF NOT EXISTS public.want_to_visit_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    coordinates TEXT NOT NULL, -- Store as "lat, lng" string
    description TEXT,
    address TEXT,
    location TEXT, -- City, Country
    marker_type TEXT DEFAULT 'default',
    marker_color TEXT DEFAULT '#3B82F6',
    labels TEXT[] DEFAULT '{}',
    favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for want_to_visit_places
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_user_id ON public.want_to_visit_places(user_id);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_type ON public.want_to_visit_places(type);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_favorite ON public.want_to_visit_places(favorite);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_created_at ON public.want_to_visit_places(created_at);

-- Enable RLS on want_to_visit_places
ALTER TABLE public.want_to_visit_places ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for want_to_visit_places
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can view their own want to visit places') THEN
        CREATE POLICY "Users can view their own want to visit places" ON public.want_to_visit_places
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can insert their own want to visit places') THEN
        CREATE POLICY "Users can insert their own want to visit places" ON public.want_to_visit_places
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can update their own want to visit places') THEN
        CREATE POLICY "Users can update their own want to visit places" ON public.want_to_visit_places
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can delete their own want to visit places') THEN
        CREATE POLICY "Users can delete their own want to visit places" ON public.want_to_visit_places
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create function to update want_to_visit_places updated_at timestamp
CREATE OR REPLACE FUNCTION update_want_to_visit_places_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update want_to_visit_places updated_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_want_to_visit_places_updated_at') THEN
        CREATE TRIGGER trigger_update_want_to_visit_places_updated_at
            BEFORE UPDATE ON public.want_to_visit_places
            FOR EACH ROW
            EXECUTE FUNCTION update_want_to_visit_places_updated_at();
    END IF;
END $$;

-- Geocoding Statistics Cache Functions and Triggers
-- Create function to update geocoding statistics cache
CREATE OR REPLACE FUNCTION update_geocoding_stats_cache(
    p_user_id UUID,
    p_total_points INTEGER DEFAULT NULL,
    p_geocoded_points INTEGER DEFAULT NULL,
    p_points_needing_geocoding INTEGER DEFAULT NULL,
    p_null_or_empty_geocodes INTEGER DEFAULT NULL,
    p_retryable_errors INTEGER DEFAULT NULL,
    p_non_retryable_errors INTEGER DEFAULT NULL,
    p_last_calculated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.user_profiles
    SET geocoding_stats = jsonb_build_object(
        'total_points', COALESCE(p_total_points, (geocoding_stats->>'total_points')::INTEGER),
        'geocoded_points', COALESCE(p_geocoded_points, (geocoding_stats->>'geocoded_points')::INTEGER),
        'points_needing_geocoding', COALESCE(p_points_needing_geocoding, (geocoding_stats->>'points_needing_geocoding')::INTEGER),
        'null_or_empty_geocodes', COALESCE(p_null_or_empty_geocodes, (geocoding_stats->>'null_or_empty_geocodes')::INTEGER),
        'retryable_errors', COALESCE(p_retryable_errors, (geocoding_stats->>'retryable_errors')::INTEGER),
        'non_retryable_errors', COALESCE(p_non_retryable_errors, (geocoding_stats->>'non_retryable_errors')::INTEGER),
        'last_calculated', p_last_calculated::TEXT,
        'cache_version', '1.0'
    ),
    updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to increment geocoding statistics when new points are added
CREATE OR REPLACE FUNCTION increment_geocoding_stats_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if the new point has a location and no geocode
    IF NEW.location IS NOT NULL AND (NEW.geocode IS NULL OR (NEW.geocode = '{}'::jsonb)) THEN
        UPDATE public.user_profiles
        SET geocoding_stats = jsonb_set(
            jsonb_set(
                COALESCE(geocoding_stats, '{}'::jsonb),
                '{points_needing_geocoding}',
                to_jsonb(COALESCE((geocoding_stats->>'points_needing_geocoding')::INTEGER, 0) + 1)
            ),
            '{total_points}',
            to_jsonb(COALESCE((geocoding_stats->>'total_points')::INTEGER, 0) + 1)
        ),
        updated_at = NOW()
        WHERE id = NEW.user_id;
    ELSIF NEW.location IS NOT NULL THEN
        -- Point has location and geocode, just increment total
        UPDATE public.user_profiles
        SET geocoding_stats = jsonb_set(
            COALESCE(geocoding_stats, '{}'::jsonb),
            '{total_points}',
            to_jsonb(COALESCE((geocoding_stats->>'total_points')::INTEGER, 0) + 1)
        ),
        updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update geocoding stats when tracker_data is inserted
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_increment_geocoding_stats_on_insert') THEN
        CREATE TRIGGER trigger_increment_geocoding_stats_on_insert
            AFTER INSERT ON public.tracker_data
            FOR EACH ROW
            EXECUTE FUNCTION increment_geocoding_stats_on_insert();
    END IF;
END $$;

-- Create function to update geocoding statistics when geocode is updated
CREATE OR REPLACE FUNCTION update_geocoding_stats_on_geocode_update()
RETURNS TRIGGER AS $$
DECLARE
    old_needs_geocoding BOOLEAN;
    new_needs_geocoding BOOLEAN;
BEGIN
    -- Determine if old geocode needed geocoding
    old_needs_geocoding := (OLD.geocode IS NULL OR OLD.geocode = '{}'::jsonb OR
                           (OLD.geocode ? 'error' AND OLD.geocode->>'error' = 'true' AND
                            OLD.geocode->>'error_message' NOT LIKE '%unable to geocode%' AND
                            OLD.geocode->>'error_message' NOT LIKE '%all nominatim endpoints failed%'));

    -- Determine if new geocode needs geocoding
    new_needs_geocoding := (NEW.geocode IS NULL OR NEW.geocode = '{}'::jsonb OR
                           (NEW.geocode ? 'error' AND NEW.geocode->>'error' = 'true' AND
                            NEW.geocode->>'error_message' NOT LIKE '%unable to geocode%' AND
                            NEW.geocode->>'error_message' NOT LIKE '%all nominatim endpoints failed%'));

    -- Only update if the status changed
    IF old_needs_geocoding != new_needs_geocoding THEN
        IF new_needs_geocoding THEN
            -- Point now needs geocoding, increment counter
            UPDATE public.user_profiles
            SET geocoding_stats = jsonb_set(
                COALESCE(geocoding_stats, '{}'::jsonb),
                '{points_needing_geocoding}',
                to_jsonb(COALESCE((geocoding_stats->>'points_needing_geocoding')::INTEGER, 0) + 1)
            ),
            updated_at = NOW()
            WHERE id = NEW.user_id;
        ELSE
            -- Point no longer needs geocoding, decrement counter and increment geocoded
            UPDATE public.user_profiles
            SET geocoding_stats = jsonb_set(
                jsonb_set(
                    COALESCE(geocoding_stats, '{}'::jsonb),
                    '{points_needing_geocoding}',
                    to_jsonb(GREATEST(COALESCE((geocoding_stats->>'points_needing_geocoding')::INTEGER, 0) - 1, 0))
                ),
                '{geocoded_points}',
                to_jsonb(COALESCE((geocoding_stats->>'geocoded_points')::INTEGER, 0) + 1)
            ),
            updated_at = NOW()
            WHERE id = NEW.user_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update geocoding stats when geocode is updated
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_geocoding_stats_on_geocode_update') THEN
        CREATE TRIGGER trigger_update_geocoding_stats_on_geocode_update
            AFTER UPDATE ON public.tracker_data
            FOR EACH ROW
            WHEN (OLD.geocode IS DISTINCT FROM NEW.geocode)
            EXECUTE FUNCTION update_geocoding_stats_on_geocode_update();
    END IF;
END $$;

-- Ensure the first user is an admin
-- This migration checks if there's only one user and makes them admin if they aren't already
DO $$
DECLARE
    user_count INTEGER;
    first_user_id UUID;
    first_user_role TEXT;
BEGIN
    -- Count total users
    SELECT COUNT(*) INTO user_count FROM auth.users;

    -- If there's only one user, ensure they're an admin
    IF user_count = 1 THEN
        -- Get the first user's ID
        SELECT id INTO first_user_id FROM auth.users LIMIT 1;

        -- Check their current role
        SELECT role INTO first_user_role FROM public.user_profiles WHERE id = first_user_id;

        -- If they're not an admin, make them one
        IF first_user_role != 'admin' THEN
            -- Update user profile
            UPDATE public.user_profiles
            SET role = 'admin', updated_at = NOW()
            WHERE id = first_user_id;

            -- Update user metadata
            UPDATE auth.users
            SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'admin')
            WHERE id = first_user_id;

            -- Log the change
            INSERT INTO public.audit_logs (
                event_type,
                description,
                severity,
                user_id,
                metadata,
                timestamp,
                created_at,
                updated_at
            ) VALUES (
                'user_role_updated',
                'First user automatically promoted to admin',
                'medium',
                first_user_id,
                jsonb_build_object('old_role', first_user_role, 'new_role', 'admin'),
                NOW(),
                NOW(),
                NOW()
            );

            RAISE NOTICE 'First user % promoted to admin', first_user_id;
        ELSE
            RAISE NOTICE 'First user % is already admin', first_user_id;
        END IF;
    ELSIF user_count = 0 THEN
        RAISE NOTICE 'No users found, skipping admin promotion';
    ELSE
        RAISE NOTICE 'Multiple users found (% users), not modifying roles', user_count;
    END IF;
END $$;