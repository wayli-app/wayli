-- Wayli Database Setup Script with PostGIS
-- Run this script in your Supabase SQL editor to create the necessary tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create the schema for the application from a placeholder
CREATE SCHEMA IF NOT EXISTS %%SCHEMA%%;

-- Create profiles table
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trips table
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'planned',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create locations table with PostGIS geometry
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES %%SCHEMA%%.trips(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create points_of_interest table with PostGIS geometry
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.points_of_interest (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID
    address TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create poi_visits table to track when users visit POIs
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.poi_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    poi_id UUID REFERENCES %%SCHEMA%%.points_of_interest(id) ON DELETE CASCADE,
    visit_start TIMESTAMP WITH TIME ZONE NOT NULL,
    visit_end TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL, -- Duration in minutes
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID (where they actually stayed)
    address TEXT, -- Address where they stayed
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1), -- How confident we are this was a real visit
    visit_type TEXT DEFAULT 'detected' CHECK (visit_type IN ('detected', 'manual', 'confirmed')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, poi_id, visit_start) -- Prevent duplicate visits for same POI at same time
);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light',
    language TEXT DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tracker_data table for OwnTracks and other tracking apps
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.tracker_data (
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

-- Create geocoded_points table to track reverse geocoding status
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.geocoded_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL, -- 'locations' or 'points_of_interest'
    record_id UUID NOT NULL, -- ID of the record in the source table
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID
    address TEXT, -- Reverse geocoded address
    geocoding_data JSONB, -- Full response from Nominatim
    geocoded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(table_name, record_id)
);

-- Create jobs table for background job processing
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.jobs (
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
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'stopped')),
    current_job UUID REFERENCES %%SCHEMA%%.jobs(id) ON DELETE SET NULL,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create temporary files table for storing file content during import jobs
CREATE TABLE IF NOT EXISTS %%SCHEMA%%.temp_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_content TEXT NOT NULL,
    format TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Note: Workers table does not have RLS enabled since workers are system processes
-- ALTER TABLE %%SCHEMA%%.workers ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON %%SCHEMA%%.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON %%SCHEMA%%.locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON %%SCHEMA%%.locations(trip_id);
CREATE INDEX IF NOT EXISTS idx_points_of_interest_user_id ON %%SCHEMA%%.points_of_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON %%SCHEMA%%.user_preferences(id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_id ON %%SCHEMA%%.tracker_data(user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_timestamp ON %%SCHEMA%%.tracker_data(recorded_at);
CREATE INDEX IF NOT EXISTS idx_tracker_data_device_id ON %%SCHEMA%%.tracker_data(device_id);
CREATE INDEX IF NOT EXISTS idx_geocoded_points_user_id ON %%SCHEMA%%.geocoded_points(user_id);
CREATE INDEX IF NOT EXISTS idx_geocoded_points_table_record ON %%SCHEMA%%.geocoded_points(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_geocoded_points_location ON %%SCHEMA%%.geocoded_points USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON %%SCHEMA%%.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON %%SCHEMA%%.jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON %%SCHEMA%%.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON %%SCHEMA%%.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_worker_id ON %%SCHEMA%%.jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON %%SCHEMA%%.workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON %%SCHEMA%%.workers(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_workers_updated_at ON %%SCHEMA%%.workers(updated_at);
CREATE INDEX IF NOT EXISTS idx_temp_files_user_id ON %%SCHEMA%%.temp_files(user_id);
CREATE INDEX IF NOT EXISTS idx_temp_files_expires_at ON %%SCHEMA%%.temp_files(expires_at);

-- Create PostGIS spatial indexes
CREATE INDEX IF NOT EXISTS idx_locations_location ON %%SCHEMA%%.locations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_points_of_interest_location ON %%SCHEMA%%.points_of_interest USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_tracker_data_location ON %%SCHEMA%%.tracker_data USING GIST(location);

-- Create RLS (Row Level Security) policies

-- Enable RLS on all tables
ALTER TABLE %%SCHEMA%%.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE %%SCHEMA%%.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE %%SCHEMA%%.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE %%SCHEMA%%.points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE %%SCHEMA%%.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE %%SCHEMA%%.tracker_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE %%SCHEMA%%.jobs ENABLE ROW LEVEL SECURITY;
-- Workers table does not have RLS enabled since workers are system processes

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON %%SCHEMA%%.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON %%SCHEMA%%.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON %%SCHEMA%%.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Trips policies
CREATE POLICY "Users can view their own trips" ON %%SCHEMA%%.trips
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trips" ON %%SCHEMA%%.trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trips" ON %%SCHEMA%%.trips
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trips" ON %%SCHEMA%%.trips
    FOR DELETE USING (auth.uid() = user_id);

-- Locations policies
CREATE POLICY "Users can view their own locations" ON %%SCHEMA%%.locations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own locations" ON %%SCHEMA%%.locations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own locations" ON %%SCHEMA%%.locations
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own locations" ON %%SCHEMA%%.locations
    FOR DELETE USING (auth.uid() = user_id);

-- Points of interest policies
CREATE POLICY "Users can view their own points of interest" ON %%SCHEMA%%.points_of_interest
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own points of interest" ON %%SCHEMA%%.points_of_interest
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own points of interest" ON %%SCHEMA%%.points_of_interest
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own points of interest" ON %%SCHEMA%%.points_of_interest
    FOR DELETE USING (auth.uid() = user_id);

-- User preferences policies
CREATE POLICY "Users can view their own preferences" ON %%SCHEMA%%.user_preferences
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own preferences" ON %%SCHEMA%%.user_preferences
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own preferences" ON %%SCHEMA%%.user_preferences
    FOR UPDATE USING (auth.uid() = id);

-- Tracker data policies
CREATE POLICY "Users can view their own tracker data" ON %%SCHEMA%%.tracker_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tracker data" ON %%SCHEMA%%.tracker_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracker data" ON %%SCHEMA%%.tracker_data
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tracker data" ON %%SCHEMA%%.tracker_data
    FOR DELETE USING (auth.uid() = user_id);

-- Geocoded points policies
CREATE POLICY "Users can view their own geocoded points" ON %%SCHEMA%%.geocoded_points
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own geocoded points" ON %%SCHEMA%%.geocoded_points
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own geocoded points" ON %%SCHEMA%%.geocoded_points
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own geocoded points" ON %%SCHEMA%%.geocoded_points
    FOR DELETE USING (auth.uid() = user_id);

-- Jobs policies
CREATE POLICY "Users can view their own jobs" ON %%SCHEMA%%.jobs
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own jobs" ON %%SCHEMA%%.jobs
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own jobs" ON %%SCHEMA%%.jobs
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own jobs" ON %%SCHEMA%%.jobs
    FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "Allow service role to update jobs" ON %%SCHEMA%%.jobs
    FOR UPDATE USING (auth.role() = 'service_role');

-- Allow workers to update jobs they're processing (no auth check for system workers)
CREATE POLICY "Workers can update jobs" ON %%SCHEMA%%.jobs
    FOR UPDATE USING (true);

-- Enable RLS on temp_files table
ALTER TABLE %%SCHEMA%%.temp_files ENABLE ROW LEVEL SECURITY;

-- Temp files policies
CREATE POLICY "Users can view their own temp files" ON %%SCHEMA%%.temp_files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own temp files" ON %%SCHEMA%%.temp_files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own temp files" ON %%SCHEMA%%.temp_files
    FOR DELETE USING (auth.uid() = user_id);

-- Allow service role to access temp files for job processing
CREATE POLICY "Service role can access temp files" ON %%SCHEMA%%.temp_files
    FOR ALL USING (auth.role() = 'service_role');

-- Workers table does not have RLS enabled since workers are system processes
-- No RLS policies needed for workers table

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION %%SCHEMA%%.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO %%SCHEMA%%.profiles (id, email, first_name, last_name, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'firstName',
        NEW.raw_user_meta_data->>'lastName',
        NEW.raw_user_meta_data->>'fullName',
        COALESCE(NEW.raw_user_meta_data->>'role', 'user')
    );

    INSERT INTO %%SCHEMA%%.user_preferences (id, theme, language, notifications_enabled)
    VALUES (NEW.id, 'light', 'en', true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION %%SCHEMA%%.handle_new_user();

-- Create trigger to update updated_at column for workers
CREATE OR REPLACE FUNCTION %%SCHEMA%%.update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workers_updated_at ON %%SCHEMA%%.workers;
CREATE TRIGGER update_workers_updated_at
    BEFORE UPDATE ON %%SCHEMA%%.workers
    FOR EACH ROW EXECUTE FUNCTION %%SCHEMA%%.update_workers_updated_at();

-- Create function to clean up expired temporary files
CREATE OR REPLACE FUNCTION %%SCHEMA%%.cleanup_expired_temp_files()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM %%SCHEMA%%.temp_files
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper functions for PostGIS operations

-- Function to get distance between two points in meters
CREATE OR REPLACE FUNCTION get_distance_meters(
    point1 GEOMETRY(POINT, 4326),
    point2 GEOMETRY(POINT, 4326)
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ST_Distance(point1::geography, point2::geography);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get points within a certain radius (in meters)
CREATE OR REPLACE FUNCTION get_points_within_radius(
    center_point GEOMETRY(POINT, 4326),
    radius_meters DECIMAL
) RETURNS TABLE (
    id UUID,
    name TEXT,
    distance DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.name,
        ST_Distance(center_point::geography, l.location::geography) as distance
    FROM %%SCHEMA%%.locations l
    WHERE ST_DWithin(center_point::geography, l.location::geography, radius_meters)
    ORDER BY distance;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get user's tracking data for a time range
CREATE OR REPLACE FUNCTION get_user_tracking_data(
    p_user_id UUID,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE
) RETURNS TABLE (
    id UUID,
    recorded_at TIMESTAMP WITH TIME ZONE,
    location GEOMETRY(POINT, 4326),
    altitude DECIMAL,
    speed DECIMAL,
    activity_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.id,
        td.recorded_at,
        td.location,
        td.altitude,
        td.speed,
        td.activity_type
    FROM %%SCHEMA%%.tracker_data td
    WHERE td.user_id = p_user_id
    AND td.recorded_at BETWEEN start_time AND end_time
    ORDER BY td.recorded_at;
END;
$$ LANGUAGE plpgsql STABLE;