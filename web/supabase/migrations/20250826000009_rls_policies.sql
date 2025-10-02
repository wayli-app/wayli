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
            FOR SELECT USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can insert their own trips') THEN
        CREATE POLICY "Users can insert their own trips" ON public.trips
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can update their own trips') THEN
        CREATE POLICY "Users can update their own trips" ON public.trips
            FOR UPDATE USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public' AND policyname = 'Users can delete their own trips') THEN
        CREATE POLICY "Users can delete their own trips" ON public.trips
            FOR DELETE USING ((SELECT auth.uid()) = user_id);
    END IF;
END $$;

-- Create RLS policies for POI visit logs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can view their own POI visit logs') THEN
        CREATE POLICY "Users can view their own POI visit logs" ON public.poi_visit_logs
            FOR SELECT USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can insert their own POI visit logs') THEN
        CREATE POLICY "Users can insert their own POI visit logs" ON public.poi_visit_logs
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can update their own POI visit logs') THEN
        CREATE POLICY "Users can update their own POI visit logs" ON public.poi_visit_logs
            FOR UPDATE USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'poi_visit_logs' AND schemaname = 'public' AND policyname = 'Users can delete their own POI visit logs') THEN
        CREATE POLICY "Users can delete their own POI visit logs" ON public.poi_visit_logs
            FOR DELETE USING ((SELECT auth.uid()) = user_id);
    END IF;
END $$;

-- Create RLS policies for user_preferences table
DO $$
BEGIN
    -- Combined SELECT policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'User preferences can be viewed') THEN
        CREATE POLICY "User preferences can be viewed" ON public.user_preferences
            FOR SELECT USING ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined INSERT policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'User preferences can be inserted') THEN
        CREATE POLICY "User preferences can be inserted" ON public.user_preferences
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined UPDATE policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'User preferences can be updated') THEN
        CREATE POLICY "User preferences can be updated" ON public.user_preferences
            FOR UPDATE USING ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined DELETE policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_preferences' AND schemaname = 'public' AND policyname = 'User preferences can be deleted') THEN
        CREATE POLICY "User preferences can be deleted" ON public.user_preferences
            FOR DELETE USING ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;
END $$;

-- Create RLS policies for user_profiles table
DO $$
BEGIN
    -- Combined SELECT policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'User profiles can be viewed') THEN
        CREATE POLICY "User profiles can be viewed" ON public.user_profiles
            FOR SELECT USING ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined INSERT policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'User profiles can be inserted') THEN
        CREATE POLICY "User profiles can be inserted" ON public.user_profiles
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined UPDATE policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'User profiles can be updated') THEN
        CREATE POLICY "User profiles can be updated" ON public.user_profiles
            FOR UPDATE USING ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined DELETE policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND schemaname = 'public' AND policyname = 'User profiles can be deleted') THEN
        CREATE POLICY "User profiles can be deleted" ON public.user_profiles
            FOR DELETE USING ((SELECT auth.uid()) = id OR (SELECT auth.role()) = 'service_role');
    END IF;
END $$;

-- Create RLS policies for tracker_data table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can view their own tracker data') THEN
        CREATE POLICY "Users can view their own tracker data" ON public.tracker_data
            FOR SELECT USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can insert their own tracker data') THEN
        CREATE POLICY "Users can insert their own tracker data" ON public.tracker_data
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can update their own tracker data') THEN
        CREATE POLICY "Users can update their own tracker data" ON public.tracker_data
            FOR UPDATE USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tracker_data' AND schemaname = 'public' AND policyname = 'Users can delete their own tracker data') THEN
        CREATE POLICY "Users can delete their own tracker data" ON public.tracker_data
            FOR DELETE USING ((SELECT auth.uid()) = user_id);
    END IF;
END $$;

-- Create RLS policies for jobs table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can view their own jobs') THEN
        CREATE POLICY "Users can view their own jobs" ON public.jobs
            FOR SELECT USING ((SELECT auth.uid())::uuid = created_by);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can insert their own jobs') THEN
        CREATE POLICY "Users can insert their own jobs" ON public.jobs
            FOR INSERT WITH CHECK ((SELECT auth.uid())::uuid = created_by);
    END IF;

    -- Combined UPDATE policy: users can update their own jobs, service role can update all, workers can update jobs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Jobs can be updated') THEN
        CREATE POLICY "Jobs can be updated" ON public.jobs
            FOR UPDATE USING (
                (SELECT auth.uid())::uuid = created_by OR
                (SELECT auth.role()) = 'service_role' OR
                EXISTS (
                    SELECT 1 FROM public.workers
                    WHERE id = (SELECT auth.uid())::uuid
                )
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND schemaname = 'public' AND policyname = 'Users can delete their own jobs') THEN
        CREATE POLICY "Users can delete their own jobs" ON public.jobs
            FOR DELETE USING ((SELECT auth.uid())::uuid = created_by);
    END IF;
END $$;

-- Create RLS policies for audit_logs table
DO $$
BEGIN
    -- Combined policy: users can view their own logs, service role can view all, admins can view all
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Users can view audit logs') THEN
        CREATE POLICY "Users can view audit logs" ON public.audit_logs
            FOR SELECT USING (
                (SELECT auth.uid()) = user_id OR
                (SELECT auth.role()) = 'service_role' OR
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE id = (SELECT auth.uid()) AND role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Service role can insert audit logs') THEN
        CREATE POLICY "Service role can insert audit logs" ON public.audit_logs
            FOR INSERT WITH CHECK ((SELECT auth.role()) = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Service role can update audit logs') THEN
        CREATE POLICY "Service role can update audit logs" ON public.audit_logs
            FOR UPDATE USING ((SELECT auth.role()) = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND schemaname = 'public' AND policyname = 'Service role can delete audit logs') THEN
        CREATE POLICY "Service role can delete audit logs" ON public.audit_logs
            FOR DELETE USING ((SELECT auth.role()) = 'service_role');
    END IF;
END $$;

-- Create policy to allow admins to read and update server settings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'server_settings' AND schemaname = 'public' AND policyname = 'Admins can manage server settings') THEN
        CREATE POLICY "Admins can manage server settings" ON public.server_settings
            FOR ALL USING (
                (SELECT auth.role()) = 'service_role' OR
                EXISTS (
                    SELECT 1 FROM public.user_profiles
                    WHERE id = (SELECT auth.uid()) AND role = 'admin'
                )
            );
    END IF;
END $$;

-- Create RLS policies for workers table
DO $$
BEGIN
    -- Combined SELECT policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Workers can be viewed') THEN
        CREATE POLICY "Workers can be viewed" ON public.workers
            FOR SELECT USING ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined INSERT policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Workers can be inserted') THEN
        CREATE POLICY "Workers can be inserted" ON public.workers
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined UPDATE policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Workers can be updated') THEN
        CREATE POLICY "Workers can be updated" ON public.workers
            FOR UPDATE USING ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');
    END IF;

    -- Combined DELETE policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workers' AND schemaname = 'public' AND policyname = 'Workers can be deleted') THEN
        CREATE POLICY "Workers can be deleted" ON public.workers
            FOR DELETE USING ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');
    END IF;
END $$;

-- Create RLS policies for want_to_visit_places
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can view their own want to visit places') THEN
        CREATE POLICY "Users can view their own want to visit places" ON public.want_to_visit_places
            FOR SELECT USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can insert their own want to visit places') THEN
        CREATE POLICY "Users can insert their own want to visit places" ON public.want_to_visit_places
            FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can update their own want to visit places') THEN
        CREATE POLICY "Users can update their own want to visit places" ON public.want_to_visit_places
            FOR UPDATE USING ((SELECT auth.uid()) = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'want_to_visit_places' AND schemaname = 'public' AND policyname = 'Users can delete their own want to visit places') THEN
        CREATE POLICY "Users can delete their own want to visit places" ON public.want_to_visit_places
            FOR DELETE USING ((SELECT auth.uid()) = user_id);
    END IF;
END $$;
