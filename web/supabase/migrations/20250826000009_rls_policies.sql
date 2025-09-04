-- RLS Policies Migration
-- This migration creates Row Level Security policies for all application tables

SET search_path TO public, gis;

-- Enable RLS on all tables
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.want_to_visit_places ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for trips table
DO $$
BEGIN
    SET search_path = public, gis;
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
