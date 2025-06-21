-- Wayli Database Setup Script with PostGIS
-- Run this script in your Supabase SQL editor to create the necessary tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "gis";

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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tracker_type TEXT NOT NULL, -- 'owntracks', 'gpx', 'fitbit', etc.
    device_id TEXT, -- Device identifier from tracking app
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID
    altitude DECIMAL(8, 2), -- Altitude in meters
    accuracy DECIMAL(8, 2), -- GPS accuracy in meters
    speed DECIMAL(8, 2), -- Speed in m/s
    heading DECIMAL(5, 2), -- Heading in degrees (0-360)
    battery_level INTEGER, -- Battery level percentage
    is_charging BOOLEAN,
    activity_type TEXT, -- 'walking', 'driving', 'cycling', etc.
    raw_data JSONB, -- Store original data from tracking app
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'stopped')),
    current_job UUID REFERENCES %%SCHEMA%%.jobs(id) ON DELETE SET NULL,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trips_user_id ON %%SCHEMA%%.trips(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON %%SCHEMA%%.locations(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_trip_id ON %%SCHEMA%%.locations(trip_id);
CREATE INDEX IF NOT EXISTS idx_points_of_interest_user_id ON %%SCHEMA%%.points_of_interest(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON %%SCHEMA%%.user_preferences(id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_id ON %%SCHEMA%%.tracker_data(user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_timestamp ON %%SCHEMA%%.tracker_data(recorded_at);
CREATE INDEX IF NOT EXISTS idx_tracker_data_device_id ON %%SCHEMA%%.tracker_data(device_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON %%SCHEMA%%.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON %%SCHEMA%%.jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON %%SCHEMA%%.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON %%SCHEMA%%.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_worker_id ON %%SCHEMA%%.jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON %%SCHEMA%%.workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON %%SCHEMA%%.workers(last_heartbeat);

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
ALTER TABLE %%SCHEMA%%.workers ENABLE ROW LEVEL SECURITY;

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

-- Jobs policies
CREATE POLICY "Users can view their own jobs" ON %%SCHEMA%%.jobs
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own jobs" ON %%SCHEMA%%.jobs
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own jobs" ON %%SCHEMA%%.jobs
    FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own jobs" ON %%SCHEMA%%.jobs
    FOR DELETE USING (auth.uid() = created_by);

-- Workers policies
CREATE POLICY "Users can view their own workers" ON %%SCHEMA%%.workers
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own workers" ON %%SCHEMA%%.workers
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own workers" ON %%SCHEMA%%.workers
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can delete their own workers" ON %%SCHEMA%%.workers
    FOR DELETE USING (auth.uid() = id);

-- Admin policies (allow admins to view all data)
CREATE POLICY "Admins can view all profiles" ON %%SCHEMA%%.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all trips" ON %%SCHEMA%%.trips
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all locations" ON %%SCHEMA%%.locations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all points of interest" ON %%SCHEMA%%.points_of_interest
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all tracker data" ON %%SCHEMA%%.tracker_data
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all jobs" ON %%SCHEMA%%.jobs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all workers" ON %%SCHEMA%%.workers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM %%SCHEMA%%.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

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
    timestamp TIMESTAMP WITH TIME ZONE,
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