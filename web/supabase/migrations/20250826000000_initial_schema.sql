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
    speed DECIMAL(12, 2), -- Speed in m/s (increased precision to avoid overflow)
    distance DECIMAL(8, 2), -- Distance compared to previous point
    time_spent DECIMAL(8, 2), -- Time difference in seconds compared to previous point
    heading DECIMAL(5, 2), -- Heading in degrees (0-360)
    battery_level INTEGER, -- Battery level percentage
    is_charging BOOLEAN,
    activity_type TEXT, -- 'walking', 'driving', 'cycling', etc.
    raw_data JSONB, -- Store original data from tracking app
    geocode JSONB, -- Store geocoded data from Nominatim
    tz_diff DECIMAL(4, 1), -- Timezone difference from UTC in hours (e.g., +2.0, -5.0)
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
CREATE INDEX IF NOT EXISTS idx_tracker_data_tz_diff ON public.tracker_data(tz_diff);

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

-- Create RLS policies for workers table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Users can view their own workers') THEN
        CREATE POLICY "Users can view their own workers" ON public.workers
            FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Users can insert their own workers') THEN
        CREATE POLICY "Users can insert their own workers" ON public.workers
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Users can update their own workers') THEN
        CREATE POLICY "Users can update their own workers" ON public.workers
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Users can delete their own workers') THEN
        CREATE POLICY "Users can delete their own workers" ON public.workers
            FOR DELETE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Service role can access all workers') THEN
        CREATE POLICY "Service role can access all workers" ON public.workers
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- Create RLS policies for spatial_ref_sys table (PostGIS spatial reference system table)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spatial_ref_sys' AND schemaname = 'public' AND policyname = 'Allow authenticated users to read spatial reference systems') THEN
        CREATE POLICY "Allow authenticated users to read spatial reference systems" ON public.spatial_ref_sys
            FOR SELECT USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spatial_ref_sys' AND schemaname = 'public' AND policyname = 'Service role can access all spatial reference systems') THEN
        CREATE POLICY "Service role can access all spatial reference systems" ON public.spatial_ref_sys
            FOR ALL USING (auth.role() = 'service_role');
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
        ST_DistanceSphere(td.location, ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)) as distance_meters
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
      AND ST_DWithin(
          td.location::geography,
          ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography,
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
    geocode JSONB,
    distance DECIMAL,
    time_spent DECIMAL
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
        td.geocode,
        td.distance,
        td.time_spent
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
      AND (start_date IS NULL OR td.recorded_at >= start_date)
      AND (end_date IS NULL OR td.recorded_at <= end_date)
    ORDER BY td.recorded_at ASC -- Changed to ASC for proper distance calculation
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

-- ========================================================================
-- MERGED MIGRATIONS START HERE
-- ========================================================================

-- ========================================================================
-- Migration: 20241201000002_make_confidence_nullable.sql
-- Make confidence column nullable in suggested_trips table
-- Since we removed the confidence logic, this column should be optional
-- ========================================================================

ALTER TABLE public.suggested_trips
ALTER COLUMN confidence DROP NOT NULL;

-- Add a comment to explain the change
COMMENT ON COLUMN public.suggested_trips.confidence IS 'Trip confidence score (0-1). Made nullable since confidence logic was removed.';

-- ========================================================================
-- Migration: 20241201000003_refactor_trip_suggestions.sql
-- Refactor trip suggestions to use trips table with status='pending'
-- This removes the need for a separate suggested_trips table
-- ========================================================================

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

-- ========================================================================
-- Migration: 20241201000003_populate_distance_column.sql
-- Calculate and populate distance column for tracker_data table
-- This migration adds distance calculations between consecutive points for each user
-- ========================================================================

-- Distance calculation now uses PostGIS functions (ST_DistanceSphere),
-- so a custom Haversine function is not required.

-- Function to update distance and time_spent for all tracker_data records using window functions
CREATE OR REPLACE FUNCTION update_tracker_distances(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER;
    user_filter TEXT := '';
BEGIN
    -- Set a longer statement timeout for this function (fixed syntax)
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting distance and time_spent calculation for user % using optimized window function approach...', target_user_id;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting distance and time_spent calculation for ALL users using optimized window function approach...';
    END IF;

    -- Use a single UPDATE with window functions and JOIN for much better performance
    WITH distance_and_time_calculations AS (
        SELECT
            t1.user_id,
            t1.recorded_at,
            t1.location,
            CASE
                WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                    0  -- First point for each user
                ELSE
                    ST_DistanceSphere(
                        LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                        t1.location
                    )
            END AS calculated_distance,
            CASE
                WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                    0  -- First point for each user
                ELSE
                    EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at)))
            END AS calculated_time_spent
        FROM public.tracker_data t1
        WHERE t1.location IS NOT NULL
        AND (target_user_id IS NULL OR t1.user_id = target_user_id)
    )
    UPDATE public.tracker_data
    SET
        distance = dc.calculated_distance,
        time_spent = dc.calculated_time_spent,
        speed = LEAST(
            ROUND((
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent)
                    ELSE 0
                END
            )::numeric, 2),
            9999999999.99
        ),
        updated_at = NOW()
    FROM distance_and_time_calculations dc
    WHERE tracker_data.user_id = dc.user_id
    AND tracker_data.recorded_at = dc.recorded_at
    AND tracker_data.location = dc.location;

    -- Get count of updated records
    GET DIAGNOSTICS total_updated = ROW_COUNT;

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Distance and time_spent calculation complete for user %. Updated % records using window functions.', target_user_id, total_updated;
    ELSE
        RAISE NOTICE 'Distance and time_spent calculation complete for ALL users. Updated % records using window functions.', total_updated;
    END IF;

    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically calculate distance and time_spent for new/updated records
CREATE OR REPLACE FUNCTION trigger_calculate_distance()
RETURNS TRIGGER AS $$
DECLARE
    prev_point RECORD;
    calculated_distance DECIMAL;
    calculated_time_spent DECIMAL;
BEGIN
    -- Only calculate if location is provided and it's an INSERT or location changed
    IF NEW.location IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.location IS DISTINCT FROM NEW.location) THEN
        -- Find the previous point for this user based on recorded_at
        SELECT
            location,
            recorded_at
        INTO prev_point
        FROM public.tracker_data
        WHERE user_id = NEW.user_id
        AND recorded_at < NEW.recorded_at
        AND location IS NOT NULL
        ORDER BY recorded_at DESC
        LIMIT 1;

        IF prev_point IS NOT NULL THEN
            -- Calculate distance from previous point
            calculated_distance := ST_DistanceSphere(prev_point.location, NEW.location);
            NEW.distance := calculated_distance;

            -- Calculate time spent (time difference in seconds from previous point)
            calculated_time_spent := EXTRACT(EPOCH FROM (NEW.recorded_at - prev_point.recorded_at));
            NEW.time_spent := calculated_time_spent;

            -- Calculate instantaneous speed in m/s with clamping to avoid overflow
            IF calculated_time_spent > 0 THEN
                NEW.speed := LEAST(ROUND(((calculated_distance / calculated_time_spent))::numeric, 2), 9999999999.99);
            ELSE
                NEW.speed := 0;
            END IF;
        ELSE
            -- First point for this user - set distance and time_spent to 0
            NEW.distance := 0;
            NEW.time_spent := 0;
            NEW.speed := 0;
        END IF;

        -- Set updated timestamp
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically calculate distance for new records
DROP TRIGGER IF EXISTS tracker_data_distance_trigger ON public.tracker_data;
CREATE TRIGGER tracker_data_distance_trigger
    BEFORE INSERT OR UPDATE ON public.tracker_data
    FOR EACH ROW
    EXECUTE FUNCTION trigger_calculate_distance();

-- Note: Distance calculation will be executed at the end of this migration
-- to ensure all functions are properly created first

-- Helper functions for managing triggers during bulk operations
CREATE OR REPLACE FUNCTION disable_tracker_data_trigger()
RETURNS void AS $$
BEGIN
    ALTER TABLE public.tracker_data DISABLE TRIGGER tracker_data_distance_trigger;
    RAISE NOTICE 'Disabled tracker_data_distance_trigger for bulk operations';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enable_tracker_data_trigger()
RETURNS void AS $$
BEGIN
    ALTER TABLE public.tracker_data ENABLE TRIGGER tracker_data_distance_trigger;
    RAISE NOTICE 'Enabled tracker_data_distance_trigger';
END;
$$ LANGUAGE plpgsql;

-- Function to safely perform bulk import with optimized distance calculation
CREATE OR REPLACE FUNCTION perform_bulk_import_with_distance_calculation(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    RAISE NOTICE 'Starting bulk import optimization for user %...', target_user_id;

    -- Disable trigger for better performance during import
    PERFORM disable_tracker_data_trigger();

    -- Calculate distances and time_spent for the imported user's data
    SELECT update_tracker_distances(target_user_id) INTO updated_count;

    -- Re-enable trigger
    PERFORM enable_tracker_data_trigger();

    RAISE NOTICE 'Bulk import optimization complete for user %. Updated % records.', target_user_id, updated_count;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update distances in batches for large datasets
CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    offset_val INTEGER := 0;
    has_more BOOLEAN := true;
    user_filter TEXT := '';
BEGIN
    -- Set a longer statement timeout for this function
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting batched distance calculation for user % (batch size: %)...', target_user_id, batch_size;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting batched distance calculation for ALL users (batch size: %)...', batch_size;
    END IF;

    -- Process data in batches to avoid memory issues
    WHILE has_more LOOP
        WITH distance_and_time_calculations AS (
            SELECT
                t1.user_id,
                t1.recorded_at,
                t1.location,
                CASE
                    WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                        0  -- First point for each user
                    ELSE
                        ST_DistanceSphere(
                            LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                            t1.location
                        )
                END AS calculated_distance,
                CASE
                    WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                        0  -- First point for each user
                    ELSE
                        EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at)))
                END AS calculated_time_spent
            FROM public.tracker_data t1
            WHERE t1.location IS NOT NULL
            AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size OFFSET offset_val
        )
        UPDATE public.tracker_data
        SET
            distance = dc.calculated_distance,
            time_spent = dc.calculated_time_spent,
            speed = LEAST(
                ROUND((
                    CASE
                        WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent)
                        ELSE 0
                    END
                )::numeric, 2),
                9999999999.99
            ),
            updated_at = NOW()
        FROM distance_and_time_calculations dc
        WHERE tracker_data.user_id = dc.user_id
        AND tracker_data.recorded_at = dc.recorded_at
        AND tracker_data.location = dc.location;

        -- Get count of updated records in this batch
        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        total_updated := total_updated + batch_updated;
        offset_val := offset_val + batch_size;

        -- Check if we have more data to process
        IF batch_updated < batch_size THEN
            has_more := false;
        END IF;

        RAISE NOTICE 'Processed batch: % records updated (total: %)', batch_updated, total_updated;

        -- Small delay to prevent overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;

    RAISE NOTICE 'Batched distance calculation complete. Total records updated: %', total_updated;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION update_tracker_distances IS 'Updates distance and time_spent columns for all tracker_data records by calculating from previous chronological point. Can target specific user for performance.';
COMMENT ON FUNCTION update_tracker_distances_batch IS 'Updates distance and time_spent columns in batches for large datasets to avoid timeouts. Can target specific user for performance.';
COMMENT ON FUNCTION trigger_calculate_distance IS 'Trigger function to automatically calculate distance and time_spent for new tracker_data records';
COMMENT ON FUNCTION disable_tracker_data_trigger IS 'Temporarily disables distance calculation trigger for bulk operations';
COMMENT ON FUNCTION enable_tracker_data_trigger IS 'Re-enables distance calculation trigger after bulk operations';
COMMENT ON FUNCTION perform_bulk_import_with_distance_calculation IS 'Optimized bulk import helper that disables triggers, calculates distances, and re-enables triggers';
COMMENT ON COLUMN public.tracker_data.distance IS 'Distance in meters from the previous chronological point for this user';
COMMENT ON COLUMN public.tracker_data.time_spent IS 'Time spent in seconds from the previous chronological point for this user';
COMMENT ON COLUMN public.tracker_data.tz_diff IS 'Timezone difference from UTC in hours (e.g., +2.0 for UTC+2, -5.0 for UTC-5)';

-- ========================================================================
-- MERGED MIGRATIONS END HERE
-- ========================================================================

-- Execute the distance and time_spent calculation for all existing records
-- This is placed at the end to ensure all functions are created first
-- This might take a while for large datasets
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    RAISE NOTICE 'Starting distance and time_spent calculation for all existing tracker_data records...';
    RAISE NOTICE 'This may take several minutes for large datasets.';

    SELECT update_tracker_distances() INTO updated_count;

    RAISE NOTICE 'Distance and time_spent calculation completed successfully!';
    RAISE NOTICE 'Updated % records total.', updated_count;
END $$;

-- ========================================================================
-- MERGED MIGRATIONS START HERE
-- ========================================================================

-- ========================================================================
-- Migration: 20241201000004_fix_statement_timeout.sql
-- Fix statement_timeout values in existing database functions
-- This migration recreates functions with the correct PostgreSQL timeout syntax
-- ========================================================================

-- Recreate update_tracker_distances function with correct timeout
CREATE OR REPLACE FUNCTION update_tracker_distances(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER;
    user_filter TEXT := '';
BEGIN
    -- Set a longer statement timeout for this function (fixed syntax)
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting distance and time_spent calculation for user % using optimized window function approach...', target_user_id;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting distance and time_spent calculation for ALL users using optimized window function approach...';
    END IF;

    -- Use a single UPDATE with window functions and JOIN for much better performance
    WITH distance_and_time_calculations AS (
        SELECT
            t1.user_id,
            t1.recorded_at,
            t1.location,
            CASE
                WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                    0  -- First point for each user
                ELSE
                    ST_DistanceSphere(
                        LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                        t1.location
                    )
            END AS calculated_distance,
            CASE
                WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                    0  -- First point for each user
                ELSE
                    EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
            END AS calculated_time_spent
        FROM public.tracker_data t1
        WHERE t1.location IS NOT NULL
        AND (target_user_id IS NULL OR t1.user_id = target_user_id)
    )
    UPDATE public.tracker_data
    SET
        distance = dc.calculated_distance,
        time_spent = dc.calculated_time_spent,
        speed = LEAST(
            ROUND((
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent)
                    ELSE 0
                END
            )::numeric, 2),
            9999999999.99
        ),
        updated_at = NOW()
    FROM distance_and_time_calculations dc
    WHERE tracker_data.user_id = dc.user_id
    AND tracker_data.recorded_at = dc.recorded_at
    AND tracker_data.location = dc.location;

    -- Get count of updated records
    GET DIAGNOSTICS total_updated = ROW_COUNT;

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Distance and time_spent calculation complete for user %. Updated % records using window functions.', target_user_id, total_updated;
    ELSE
        RAISE NOTICE 'Distance and time_spent calculation complete for ALL users. Updated % records using window functions.', total_updated;
    END IF;

    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Recreate update_tracker_distances_batch function with correct timeout
CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    offset_val INTEGER := 0;
    has_more BOOLEAN := true;
    user_filter TEXT := '';
BEGIN
    -- Set a longer statement timeout for this function (fixed syntax)
    SET LOCAL statement_timeout = '30min';

    IF target_user_id IS NOT NULL THEN
        RAISE NOTICE 'Starting batched distance calculation for user % (batch size: %)...', target_user_id, batch_size;
        user_filter := ' AND t1.user_id = $1';
    ELSE
        RAISE NOTICE 'Starting batched distance calculation for ALL users (batch size: %)...', batch_size;
    END IF;

    -- Process data in batches to avoid memory issues
    WHILE has_more LOOP
        WITH distance_and_time_calculations AS (
            SELECT
                t1.user_id,
                t1.recorded_at,
                t1.location,
                CASE
                    WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                        0  -- First point for each user
                    ELSE
                        ST_DistanceSphere(
                            LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                            t1.location
                        )
                END AS calculated_distance,
                CASE
                    WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN
                        0  -- First point for each user
                    ELSE
                        EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
                END AS calculated_time_spent
            FROM public.tracker_data t1
            WHERE t1.location IS NOT NULL
            AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size OFFSET offset_val
        )
        UPDATE public.tracker_data
        SET
            distance = dc.calculated_distance,
            time_spent = dc.calculated_time_spent,
            speed = LEAST(
                ROUND((
                    CASE
                        WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent)
                        ELSE 0
                    END
                )::numeric, 2),
                9999999999.99
            ),
            updated_at = NOW()
        FROM distance_and_time_calculations dc
        WHERE tracker_data.user_id = dc.user_id
        AND tracker_data.recorded_at = dc.recorded_at
        AND tracker_data.location = dc.location;

        -- Get count of updated records in this batch
        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        total_updated := total_updated + batch_updated;
        offset_val := offset_val + batch_size;

        -- Check if we have more data to process
        IF batch_updated < batch_size THEN
            has_more := false;
        END IF;

        RAISE NOTICE 'Processed batch: % records updated (total: %)', batch_updated, total_updated;

        -- Small delay to prevent overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;

    RAISE NOTICE 'Batched distance calculation complete. Total records updated: %', total_updated;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION update_tracker_distances IS 'Updates distance and time_spent columns for all tracker_data records by calculating from previous chronological point. Can target specific user for performance. (Fixed timeout syntax)';
COMMENT ON FUNCTION update_tracker_distances_batch IS 'Updates distance and time_spent columns in batches for large datasets to avoid timeouts. Can target specific user for performance. (Fixed timeout syntax)';

-- ========================================================================
-- Migration: 20241201000005_add_full_country_function.sql
-- Add the full_country function to map ISO 3166-1 alpha-2 country codes to full names
-- ========================================================================

-- Returns the full country name for a given ISO 3166-1 alpha-2 code
CREATE OR REPLACE FUNCTION full_country(country text) RETURNS text AS $$
SELECT value
FROM json_each_text('{
  "AF": "Afghanistan",
  "AL": "Albania",
  "DZ": "Algeria",
  "AS": "American Samoa",
  "AD": "Andorra",
  "AO": "Angola",
  "AI": "Anguilla",
  "AQ": "Antarctica",
  "AG": "Antigua and Barbuda",
  "AR": "Argentina",
  "AM": "Armenia",
  "AW": "Aruba",
  "AU": "Australia",
  "AT": "Austria",
  "AZ": "Azerbaijan",
  "BS": "Bahamas",
  "BH": "Bahrain",
  "BD": "Bangladesh",
  "BB": "Barbados",
  "BY": "Belarus",
  "BE": "Belgium",
  "BZ": "Belize",
  "BJ": "Benin",
  "BM": "Bermuda",
  "BT": "Bhutan",
  "BO": "Bolivia",
  "BQ": "Bonaire, Sint Eustatius and Saba",
  "BA": "Bosnia and Herzegovina",
  "BW": "Botswana",
  "BV": "Bouvet Island",
  "BR": "Brazil",
  "IO": "British Indian Ocean Territory",
  "BN": "Brunei Darussalam",
  "BG": "Bulgaria",
  "BF": "Burkina Faso",
  "BI": "Burundi",
  "CV": "Cabo Verde",
  "KH": "Cambodia",
  "CM": "Cameroon",
  "CA": "Canada",
  "KY": "Cayman Islands",
  "CF": "Central African Republic",
  "TD": "Chad",
  "CL": "Chile",
  "CN": "China",
  "CX": "Christmas Island",
  "CC": "Cocos (Keeling) Islands",
  "CO": "Colombia",
  "KM": "Comoros",
  "CG": "Congo",
  "CD": "Congo, Democratic Republic of the",
  "CK": "Cook Islands",
  "CR": "Costa Rica",
  "CI": "Côte d''Ivoire",
  "HR": "Croatia",
  "CU": "Cuba",
  "CW": "Curaçao",
  "CY": "Cyprus",
  "CZ": "Czech Republic",
  "DK": "Denmark",
  "DJ": "Djibouti",
  "DM": "Dominica",
  "DO": "Dominican Republic",
  "EC": "Ecuador",
  "EG": "Egypt",
  "SV": "El Salvador",
  "GQ": "Equatorial Guinea",
  "ER": "Eritrea",
  "EE": "Estonia",
  "SZ": "Eswatini",
  "ET": "Ethiopia",
  "FK": "Falkland Islands (Malvinas)",
  "FO": "Faroe Islands",
  "FJ": "Fiji",
  "FI": "Finland",
  "FR": "France",
  "GF": "French Guiana",
  "PF": "French Polynesia",
  "TF": "French Southern Territories",
  "GA": "Gabon",
  "GM": "Gambia",
  "GE": "Georgia",
  "DE": "Germany",
  "GH": "Ghana",
  "GI": "Gibraltar",
  "GR": "Greece",
  "GL": "Greenland",
  "GD": "Grenada",
  "GP": "Guadeloupe",
  "GU": "Guam",
  "GT": "Guatemala",
  "GG": "Guernsey",
  "GN": "Guinea",
  "GW": "Guinea-Bissau",
  "GY": "Guyana",
  "HT": "Haiti",
  "HM": "Heard Island and McDonald Islands",
  "VA": "Holy See (Vatican City State)",
  "HN": "Honduras",
  "HK": "Hong Kong",
  "HU": "Hungary",
  "IS": "Iceland",
  "IN": "India",
  "ID": "Indonesia",
  "IR": "Iran, Islamic Republic of",
  "IQ": "Iraq",
  "IE": "Ireland",
  "IM": "Isle of Man",
  "IL": "Israel",
  "IT": "Italy",
  "JM": "Jamaica",
  "JP": "Japan",
  "JE": "Jersey",
  "JO": "Jordan",
  "KZ": "Kazakhstan",
  "KE": "Kenya",
  "KI": "Kiribati",
  "KP": "Korea, Democratic People''s Republic of",
  "KR": "Korea, Republic of",
  "KW": "Kuwait",
  "KG": "Kyrgyzstan",
  "LA": "Lao People''s Democratic Republic",
  "LV": "Latvia",
  "LB": "Lebanon",
  "LS": "Lesotho",
  "LR": "Liberia",
  "LY": "Libya",
  "LI": "Liechtenstein",
  "LT": "Lithuania",
  "LU": "Luxembourg",
  "MO": "Macao",
  "MK": "North Macedonia",
  "MG": "Madagascar",
  "MW": "Malawi",
  "MY": "Malaysia",
  "MV": "Maldives",
  "ML": "Mali",
  "MT": "Malta",
  "MH": "Marshall Islands",
  "MQ": "Martinique",
  "MR": "Mauritania",
  "MU": "Mauritius",
  "YT": "Mayotte",
  "MX": "Mexico",
  "FM": "Micronesia, Federated States of",
  "MD": "Moldova, Republic of",
  "MC": "Monaco",
  "MN": "Mongolia",
  "ME": "Montenegro",
  "MS": "Montserrat",
  "MA": "Morocco",
  "MZ": "Mozambique",
  "MM": "Myanmar",
  "NA": "Namibia",
  "NR": "Nauru",
  "NP": "Nepal",
  "NL": "Netherlands",
  "NC": "New Caledonia",
  "NZ": "New Zealand",
  "NI": "Nicaragua",
  "NE": "Niger",
  "NG": "Nigeria",
  "NU": "Niue",
  "NF": "Norfolk Island",
  "MP": "Northern Mariana Islands",
  "NO": "Norway",
  "OM": "Oman",
  "PK": "Pakistan",
  "PW": "Palau",
  "PS": "Palestine, State of",
  "PA": "Panama",
  "PG": "Papua New Guinea",
  "PY": "Paraguay",
  "PE": "Peru",
  "PH": "Philippines",
  "PN": "Pitcairn",
  "PL": "Poland",
  "PT": "Portugal",
  "PR": "Puerto Rico",
  "QA": "Qatar",
  "RE": "Réunion",
  "RO": "Romania",
  "RU": "Russian Federation",
  "RW": "Rwanda",
  "BL": "Saint Barthélemy",
  "SH": "Saint Helena, Ascension and Tristan da Cunha",
  "KN": "Saint Kitts and Nevis",
  "LC": "Saint Lucia",
  "MF": "Saint Martin (French part)",
  "PM": "Saint Pierre and Miquelon",
  "VC": "Saint Vincent and the Grenadines",
  "WS": "Samoa",
  "SM": "San Marino",
  "ST": "Sao Tome and Principe",
  "SA": "Saudi Arabia",
  "SN": "Senegal",
  "RS": "Serbia",
  "SC": "Seychelles",
  "SL": "Sierra Leone",
  "SG": "Singapore",
  "SK": "Slovakia",
  "SI": "Slovenia",
  "SB": "Solomon Islands",
  "SO": "Somalia",
  "ZA": "South Africa",
  "GS": "South Georgia and the South Sandwich Islands",
  "SS": "South Sudan",
  "ES": "Spain",
  "LK": "Sri Lanka",
  "SD": "Sudan",
  "SR": "Suriname",
  "SJ": "Svalbard and Jan Mayen",
  "SZ": "Eswatini",
  "SE": "Sweden",
  "CH": "Switzerland",
  "SY": "Syrian Arab Republic",
  "TW": "Taiwan, Province of China",
  "TJ": "Tajikistan",
  "TZ": "Tanzania, United Republic of",
  "TH": "Thailand",
  "TL": "Timor-Leste",
  "TG": "Togo",
  "TK": "Tokelau",
  "TO": "Tonga",
  "TT": "Trinidad and Tobago",
  "TN": "Tunisia",
  "TR": "Turkey",
  "TM": "Turkmenistan",
  "TC": "Turks and Caicos Islands",
  "TV": "Tuvalu",
  "UG": "Uganda",
  "UA": "Ukraine",
  "AE": "United Arab Emirates",
  "GB": "United Kingdom",
  "US": "United States",
  "UM": "United States Minor Outlying Islands",
  "UY": "Uruguay",
  "UZ": "Uzbekistan",
  "VU": "Vanuatu",
  "VE": "Venezuela, Bolivarian Republic of",
  "VN": "Viet Nam",
  "VG": "Virgin Islands, British",
  "VI": "Virgin Islands, U.S.",
  "WF": "Wallis and Futuna",
  "EH": "Western Sahara",
  "YE": "Yemen",
  "ZM": "Zambia",
  "ZW": "Zimbabwe"
}') AS json_data(key, value)
WHERE key = UPPER(country);
$$ LANGUAGE sql IMMUTABLE;

-- Add comment for documentation
COMMENT ON FUNCTION full_country(text) IS 'Maps ISO 3166-1 alpha-2 country codes to full country names';

-- ========================================================================
-- Migration: 20250812000200_update_tracker_distance_time_precision.sql
-- Widen distance/time_spent precision and cast before rounding to prevent numeric overflow during imports
-- ========================================================================

-- Increase precision on distance and time_spent
ALTER TABLE public.tracker_data
  ALTER COLUMN distance TYPE numeric(12,2) USING COALESCE(distance, 0)::numeric,
  ALTER COLUMN time_spent TYPE numeric(12,2) USING COALESCE(time_spent, 0)::numeric;

-- Recreate the bulk update function with safe casts and rounding
CREATE OR REPLACE FUNCTION update_tracker_distances(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER;
BEGIN
    WITH distance_and_time_calculations AS (
        SELECT
            t1.user_id,
            t1.recorded_at,
            t1.location,
            CASE
                WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                ELSE ST_DistanceSphere(
                    LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                    t1.location
                )
            END AS calculated_distance,
            CASE
                WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                ELSE EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
            END AS calculated_time_spent
        FROM public.tracker_data t1
        WHERE t1.location IS NOT NULL
          AND (target_user_id IS NULL OR t1.user_id = target_user_id)
    )
    UPDATE public.tracker_data AS td
    SET
        distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
        time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
        speed = LEAST(ROUND((CASE WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent) ELSE 0 END)::numeric, 2), 9999999999.99)
    FROM distance_and_time_calculations dc
    WHERE td.user_id = dc.user_id
      AND td.recorded_at = dc.recorded_at
      AND td.location = dc.location;

    GET DIAGNOSTICS total_updated = ROW_COUNT;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Create a new optimized batch processing function to prevent timeouts
CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    user_filter TEXT := '';
    has_more_records BOOLEAN := TRUE;
BEGIN
    -- Set longer timeout for this function
    SET statement_timeout = '600s';  -- 10 minutes

    IF target_user_id IS NOT NULL THEN
        user_filter := ' AND t1.user_id = $1';
    END IF;

    RAISE NOTICE 'Starting efficient distance calculation for records without distances (batch size: %)', batch_size;

    -- Loop until no more records need processing
    WHILE has_more_records LOOP
        -- Process only records that don't have distance calculated yet
        WITH distance_and_time_calculations AS (
            SELECT
                t1.user_id,
                t1.recorded_at,
                t1.location,
                CASE
                    WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                    ELSE ST_DistanceSphere(
                        LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                        t1.location
                    )
                END AS calculated_distance,
                CASE
                    WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                    ELSE EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
                END AS calculated_time_spent
            FROM public.tracker_data t1
            WHERE t1.location IS NOT NULL
              AND (t1.distance IS NULL OR t1.distance = 0)  -- Only process records without distance
              AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size
        )
        UPDATE public.tracker_data AS td
        SET
            distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
            time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
            speed = LEAST(ROUND((CASE WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent) ELSE 0 END)::numeric, 2), 9999999999.99)
        FROM distance_and_time_calculations dc
        WHERE td.user_id = dc.user_id
          AND td.recorded_at = dc.recorded_at
          AND td.location = dc.location;

        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        -- If no records were updated, we're done
        IF batch_updated = 0 THEN
            has_more_records := FALSE;
        ELSE
            total_updated := total_updated + batch_updated;
            RAISE NOTICE 'Processed batch: % records, total: %', batch_updated, total_updated;

            -- Small delay to prevent overwhelming the database
            PERFORM pg_sleep(0.1);
        END IF;
    END LOOP;

    RAISE NOTICE 'Efficient distance calculation completed: % total records updated', total_updated;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger function with safe casts
CREATE OR REPLACE FUNCTION trigger_calculate_distance()
RETURNS TRIGGER AS $$
DECLARE
    prev_point RECORD;
    calculated_distance DOUBLE PRECISION;
    calculated_time_spent DOUBLE PRECISION;
    computed_speed DOUBLE PRECISION;
BEGIN
    IF NEW.location IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.location IS DISTINCT FROM NEW.location) THEN
        SELECT location, recorded_at
          INTO prev_point
          FROM public.tracker_data
         WHERE user_id = NEW.user_id
           AND recorded_at < NEW.recorded_at
           AND location IS NOT NULL
         ORDER BY recorded_at DESC
         LIMIT 1;

        IF prev_point IS NOT NULL THEN
            calculated_distance := ST_DistanceSphere(prev_point.location, NEW.location);
            NEW.distance := LEAST(ROUND(calculated_distance::numeric, 2), 9999999999.99);

            calculated_time_spent := EXTRACT(EPOCH FROM (NEW.recorded_at - prev_point.recorded_at));
            NEW.time_spent := LEAST(ROUND(calculated_time_spent::numeric, 2), 9999999999.99);

            IF calculated_time_spent > 0 THEN
                computed_speed := calculated_distance / calculated_time_spent;
                NEW.speed := LEAST(ROUND(computed_speed::numeric, 2), 9999999999.99);
            ELSE
                NEW.speed := 0;
            END IF;
        ELSE
            NEW.distance := 0;
            NEW.time_spent := 0;
            NEW.speed := 0;
        END IF;

        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- Migration: 20250812000201_add_tracker_data_performance_indexes.sql
-- Add performance indexes for distance calculation queries
-- This migration adds composite indexes to improve the performance of the update_tracker_distances_batch function
-- ========================================================================

-- Composite index for user_id + recorded_at + location (for the main distance calculation query)
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_timestamp_location
ON public.tracker_data(user_id, recorded_at)
WHERE location IS NOT NULL;

-- Composite index for user_id + recorded_at + distance (for finding records without distance)
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_timestamp_distance
ON public.tracker_data(user_id, recorded_at)
WHERE distance IS NULL OR distance = 0;

-- Index for the LAG window function optimization
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_timestamp_ordered
ON public.tracker_data(user_id, recorded_at, location)
WHERE location IS NOT NULL;

-- Add comment explaining the purpose of these indexes
COMMENT ON INDEX idx_tracker_data_user_timestamp_location IS 'Optimizes distance calculation queries by user and timestamp with location filter';
COMMENT ON INDEX idx_tracker_data_user_timestamp_distance IS 'Optimizes finding records that need distance calculation';
COMMENT ON INDEX idx_tracker_data_user_timestamp_ordered IS 'Optimizes LAG window function performance for distance calculations';

-- ========================================================================
-- Migration: 20250812000202_optimize_distance_calculation_function.sql
-- Optimize the distance calculation function for better performance and timeout handling
-- This migration improves the update_tracker_distances_batch function
-- ========================================================================

-- Optimize the distance calculation function for better performance and timeout handling
CREATE OR REPLACE FUNCTION update_tracker_distances_batch(
    target_user_id UUID DEFAULT NULL,
    batch_size INTEGER DEFAULT 1000  -- Reduced default batch size
)
RETURNS INTEGER AS $$
DECLARE
    total_updated INTEGER := 0;
    batch_updated INTEGER;
    user_filter TEXT := '';
    has_more_records BOOLEAN := TRUE;
    start_time TIMESTAMP := clock_timestamp();
    max_execution_time INTERVAL := INTERVAL '5 minutes';  -- Reduced from 10 minutes
BEGIN
    -- Set shorter timeout for this function to prevent long-running operations
    SET statement_timeout = '300s';  -- 5 minutes

    -- Check if we're approaching the execution time limit
    IF clock_timestamp() - start_time > max_execution_time THEN
        RAISE NOTICE 'Function execution time limit approaching, returning partial results';
        RETURN total_updated;
    END IF;

    IF target_user_id IS NOT NULL THEN
        user_filter := ' AND t1.user_id = $1';
    END IF;

    RAISE NOTICE 'Starting optimized distance calculation for records without distances (batch size: %)', batch_size;

    -- Loop until no more records need processing or time limit reached
    WHILE has_more_records AND (clock_timestamp() - start_time) < max_execution_time LOOP
        -- Process only records that don't have distance calculated yet
        WITH distance_and_time_calculations AS (
            SELECT
                t1.user_id,
                t1.recorded_at,
                t1.location,
                CASE
                    WHEN LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                    ELSE ST_DistanceSphere(
                        LAG(t1.location) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at),
                        t1.location
                    )
                END AS calculated_distance,
                CASE
                    WHEN LAG(t1.recorded_at) OVER (PARTITION BY t1.user_id ORDER BY t1.recorded_at) IS NULL THEN 0
                    ELSE EXTRACT(EPOCH FROM (t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)))
                END AS calculated_time_spent
            FROM public.tracker_data t1
            WHERE t1.location IS NOT NULL
              AND (t1.distance IS NULL OR t1.distance = 0)  -- Only process records without distance
              AND (target_user_id IS NULL OR t1.user_id = target_user_id)
            ORDER BY t1.user_id, t1.recorded_at
            LIMIT batch_size
        )
        UPDATE public.tracker_data AS td
        SET
            distance = LEAST(ROUND(dc.calculated_distance::numeric, 2), 9999999999.99),
            time_spent = LEAST(ROUND(dc.calculated_time_spent::numeric, 2), 9999999999.99),
            speed = LEAST(ROUND((CASE WHEN dc.calculated_time_spent > 0 THEN (dc.calculated_distance / dc.calculated_time_spent) ELSE 0 END)::numeric, 2), 9999999999.99)
        FROM distance_and_time_calculations dc
        WHERE td.user_id = dc.user_id
          AND td.recorded_at = dc.recorded_at
          AND td.location = dc.location;

        GET DIAGNOSTICS batch_updated = ROW_COUNT;

        -- If no records were updated, we're done
        IF batch_updated = 0 THEN
            has_more_records := FALSE;
        ELSE
            total_updated := total_updated + batch_updated;
            RAISE NOTICE 'Processed batch: % records, total: %', batch_updated, total_updated;

            -- Check execution time limit
            IF (clock_timestamp() - start_time) >= max_execution_time THEN
                RAISE NOTICE 'Execution time limit reached, returning partial results: % records updated', total_updated;
                has_more_records := FALSE;
            ELSE
                -- Small delay to prevent overwhelming the database
                PERFORM pg_sleep(0.05);  -- Reduced from 0.1s
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Optimized distance calculation completed: % total records updated in %',
                 total_updated,
                 clock_timestamp() - start_time;
    RETURN total_updated;
END;
$$ LANGUAGE plpgsql;

-- Update the function comment
COMMENT ON FUNCTION update_tracker_distances_batch IS 'Updates distance and time_spent columns in optimized batches for large datasets. Includes execution time limits and improved performance.';

-- ========================================================================
-- MERGED MIGRATIONS END HERE
-- ========================================================================
