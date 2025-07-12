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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
    reverse_geocode JSONB, -- Store geocoded data from Nominatim
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    worker_id TEXT
);

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
    poi_id UUID REFERENCES public.points_of_interest(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_start TIMESTAMP WITH TIME ZONE NOT NULL,
    visit_end TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    visit_type TEXT DEFAULT 'detected' CHECK (visit_type IN ('detected', 'manual', 'confirmed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(poi_id, user_id, visit_start) -- Prevent duplicate visits for same POI at same time
);



-- Create indexes for better performance

CREATE INDEX IF NOT EXISTS idx_trips_user_id ON public.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON public.trips(start_date);
CREATE INDEX IF NOT EXISTS idx_trips_end_date ON public.trips(end_date);

CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_poi_id ON public.poi_visit_logs(poi_id);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_user_id ON public.poi_visit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_visit_start ON public.poi_visit_logs(visit_start);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_visit_end ON public.poi_visit_logs(visit_end);
CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON public.user_preferences(id);
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


-- Create spatial indexes for PostGIS
CREATE INDEX IF NOT EXISTS idx_tracker_data_location ON public.tracker_data USING GIST(location);


ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;




CREATE POLICY "Users can view their own trips" ON public.trips
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trips" ON public.trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trips" ON public.trips
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trips" ON public.trips
    FOR DELETE USING (auth.uid() = user_id);



CREATE POLICY "Users can view their own POI visit logs" ON public.poi_visit_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own POI visit logs" ON public.poi_visit_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own POI visit logs" ON public.poi_visit_logs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own POI visit logs" ON public.poi_visit_logs
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own preferences" ON public.user_preferences
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own preferences" ON public.user_preferences
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own preferences" ON public.user_preferences
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view their own tracker data" ON public.tracker_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tracker data" ON public.tracker_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracker data" ON public.tracker_data
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tracker data" ON public.tracker_data
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own jobs" ON public.jobs
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own jobs" ON public.jobs
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own jobs" ON public.jobs
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own jobs" ON public.jobs
    FOR DELETE USING (auth.uid() = created_by);

-- Allow service role to update jobs (for background processing)
CREATE POLICY "Allow service role to update jobs" ON public.jobs
    FOR UPDATE USING (auth.role() = 'service_role');

-- Allow workers to update jobs
CREATE POLICY "Workers can update jobs" ON public.jobs
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT user_id FROM public.workers WHERE id::text = worker_id
        )
    );



-- Function to handle new user creation and assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_count INTEGER;
    user_role TEXT;
    updated_metadata JSONB;
BEGIN
    -- Count existing users
    SELECT COUNT(*) INTO user_count FROM auth.users;

    -- If this is the first user, make them admin, otherwise make them a regular user
    IF user_count = 1 THEN
        user_role := 'admin';
    ELSE
        user_role := 'user';
    END IF;

    -- Update user metadata with role
    updated_metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) ||
                       jsonb_build_object('role', user_role);

    -- Update the user's metadata with the role
    UPDATE auth.users
    SET raw_user_meta_data = updated_metadata
    WHERE id = NEW.id;

    -- Insert user preferences
    INSERT INTO public.user_preferences (id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update workers updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workers updated_at
CREATE TRIGGER update_workers_updated_at
    BEFORE UPDATE ON public.workers
    FOR EACH ROW EXECUTE FUNCTION public.update_workers_updated_at();

-- Function to update POI statistics when visit logs are added/updated
CREATE OR REPLACE FUNCTION update_poi_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the points_of_interest table with aggregated statistics
    UPDATE public.points_of_interest
    SET
        visit_count = (
            SELECT COUNT(*)
            FROM public.poi_visit_logs
            WHERE poi_id = NEW.poi_id
        ),
        first_visit = (
            SELECT MIN(visit_start)
            FROM public.poi_visit_logs
            WHERE poi_id = NEW.poi_id
        ),
        last_visit = (
            SELECT MAX(visit_end)
            FROM public.poi_visit_logs
            WHERE poi_id = NEW.poi_id
        ),
        total_visit_duration_minutes = (
            SELECT COALESCE(SUM(duration_minutes), 0)
            FROM public.poi_visit_logs
            WHERE poi_id = NEW.poi_id
        ),
        average_visit_duration_minutes = (
            SELECT COALESCE(AVG(duration_minutes), 0)
            FROM public.poi_visit_logs
            WHERE poi_id = NEW.poi_id
        ),
        updated_at = NOW()
    WHERE id = NEW.poi_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update POI statistics
CREATE TRIGGER trigger_update_poi_statistics
    AFTER INSERT OR UPDATE OR DELETE ON public.poi_visit_logs
    FOR EACH ROW EXECUTE FUNCTION update_poi_statistics();

-- Function to cleanup expired temp files


-- Create storage bucket for temporary files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'temp-files',
    'temp-files',
    false,
    1073741824, -- 1GB file size limit
    ARRAY['application/json', 'application/geo+json', 'text/xml', 'application/gpx+xml', 'text/plain']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for temp-files bucket
-- Allow users to upload their own files
CREATE POLICY "Users can upload their own temp files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'temp-files' AND
        auth.uid()::text = (storage.foldername(name))[2]
    );

-- Allow users to download their own files
CREATE POLICY "Users can download their own temp files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'temp-files' AND
        auth.uid()::text = (storage.foldername(name))[2]
    );

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own temp files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'temp-files' AND
        auth.uid()::text = (storage.foldername(name))[2]
    );

-- Allow service role to access all files (for background processing)
CREATE POLICY "Service role can access all temp files" ON storage.objects
    FOR ALL USING (auth.role() = 'service_role');

-- Create storage bucket for trip images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'trip-images',
    'trip-images',
    true, -- Public bucket for easy image display
    5242880, -- 5MB file size limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for trip-images bucket
-- Allow users to upload their own images to their user folder
CREATE POLICY "Users can upload their own trip images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'trip-images' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow users to view their own images
CREATE POLICY "Users can view their own trip images" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'trip-images' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow users to update their own images
CREATE POLICY "Users can update their own trip images" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'trip-images' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own trip images" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'trip-images' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow public read access for displaying images (since bucket is public)
CREATE POLICY "Public can view trip images" ON storage.objects
    FOR SELECT USING (bucket_id = 'trip-images');

-- Allow service role to access all files (for background processing)
CREATE POLICY "Service role can access all trip images" ON storage.objects
    FOR ALL USING (auth.role() = 'service_role');

-- Create utility functions for distance calculations
CREATE OR REPLACE FUNCTION get_distance_meters(
    point1 GEOMETRY(POINT, 4326),
    point2 GEOMETRY(POINT, 4326)
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ST_Distance(point1::geography, point2::geography);
END;
$$ LANGUAGE plpgsql;

-- Function to get points within a radius
CREATE OR REPLACE FUNCTION get_points_within_radius(
    center_point GEOMETRY(POINT, 4326),
    radius_meters DECIMAL,
    table_name TEXT
) RETURNS TABLE (
    id UUID,
    name TEXT,
    location GEOMETRY(POINT, 4326),
    distance DECIMAL
) AS $$
BEGIN
    RETURN QUERY EXECUTE format(
        'SELECT id, name, location, ST_Distance(location::geography, %L::geography) as distance
         FROM %I
         WHERE ST_DWithin(location::geography, %L::geography, %s)
         ORDER BY distance',
        center_point, table_name, center_point, radius_meters
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user tracking data
CREATE OR REPLACE FUNCTION get_user_tracking_data(
    user_uuid UUID,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE
) RETURNS TABLE (
    recorded_at TIMESTAMP WITH TIME ZONE,
    location GEOMETRY(POINT, 4326),
    altitude DECIMAL,
    accuracy DECIMAL,
    speed DECIMAL,
    activity_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.recorded_at,
        td.location,
        td.altitude,
        td.accuracy,
        td.speed,
        td.activity_type
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
        AND td.recorded_at BETWEEN start_time AND end_time
    ORDER BY td.recorded_at;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT raw_user_meta_data->>'role' INTO user_role
    FROM auth.users
    WHERE id = user_uuid;

    RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get POI visit statistics for a user
CREATE OR REPLACE FUNCTION get_user_poi_statistics(
    user_uuid UUID,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_pois INTEGER,
    total_visits INTEGER,
    unique_pois_visited INTEGER,
    total_duration_minutes INTEGER,
    average_duration_minutes DECIMAL(8,2),
    most_visited_poi TEXT,
    most_visited_poi_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH user_visits AS (
        SELECT
            pvl.poi_id,
            pvl.duration_minutes,
            poi.name as poi_name
        FROM public.poi_visit_logs pvl
        JOIN public.points_of_interest poi ON pvl.poi_id = poi.id
        WHERE pvl.user_id = user_uuid
        AND pvl.visit_start >= NOW() - INTERVAL '1 day' * days_back
    ),
    poi_counts AS (
        SELECT
            poi_name,
            COUNT(*) as visit_count
        FROM user_visits
        GROUP BY poi_name
        ORDER BY visit_count DESC
        LIMIT 1
    )
    SELECT
        (SELECT COUNT(DISTINCT poi_id) FROM user_visits)::INTEGER,
        (SELECT COUNT(*) FROM user_visits)::INTEGER,
        (SELECT COUNT(DISTINCT poi_id) FROM user_visits)::INTEGER,
        (SELECT COALESCE(SUM(duration_minutes), 0) FROM user_visits)::INTEGER,
        (SELECT COALESCE(AVG(duration_minutes), 0) FROM user_visits)::DECIMAL(8,2),
        (SELECT poi_name FROM poi_counts LIMIT 1),
        (SELECT visit_count FROM poi_counts LIMIT 1)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SERVER SETTINGS
-- ============================================================================

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

-- Insert default settings if table is empty
INSERT INTO public.server_settings (server_name, admin_email, allow_registration, require_email_verification)
VALUES ('Wayli', NULL, true, false)
ON CONFLICT DO NOTHING;

-- Create function to get server settings
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

-- Enable RLS on server_settings table
ALTER TABLE public.server_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow admins to read and update server settings
CREATE POLICY "Admins can manage server settings" ON public.server_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );