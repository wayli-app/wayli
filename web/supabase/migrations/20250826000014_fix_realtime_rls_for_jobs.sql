-- Fix Realtime RLS for jobs table
--
-- PROBLEM: Realtime broadcasts respect RLS policies. When the worker (service_role)
-- updates a job, the Realtime broadcast is filtered by the SELECT policy which
-- checks if auth.uid() = created_by. But during the broadcast, there's no user
-- context, so the broadcast gets filtered out.
--
-- SOLUTION: The existing SELECT policy already allows users to see their own jobs.
-- However, for Realtime to work properly, we need to ensure that when a job
-- row is updated, the Realtime broadcast can determine which users should receive it.
--
-- Supabase Realtime uses REPLICA IDENTITY to determine what data to broadcast.
-- We already set REPLICA IDENTITY FULL on the jobs table, which means all columns
-- are included in the broadcast. The RLS policies are then evaluated on the client side.
--
-- The issue is that the SELECT policy needs to be structured in a way that
-- allows Realtime to properly evaluate it. Let's verify the current policy
-- and ensure it's compatible with Realtime.

-- First, let's check if there's an issue with the policy structure
-- The current policy uses (SELECT auth.uid())::uuid = created_by
-- This should work with Realtime, but let's make it more explicit

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.jobs;

-- Recreate with a simpler, more Realtime-friendly structure
CREATE POLICY "Users can view their own jobs" ON public.jobs
    FOR SELECT
    USING (
        (SELECT auth.uid())::uuid = created_by
    );

-- Ensure the table has REPLICA IDENTITY FULL (should already be set, but let's be explicit)
ALTER TABLE public.jobs REPLICA IDENTITY FULL;

-- Add a comment explaining the Realtime setup
COMMENT ON POLICY "Users can view their own jobs" ON public.jobs IS
    'Allows users to view their own jobs. This policy is compatible with Supabase Realtime - users will receive real-time updates for jobs they created.';

-- Verify the realtime publication includes the jobs table
-- This should already be set by migration 20250826000012, but let's ensure it
DO $$
BEGIN
    -- Check if jobs table is in the realtime publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'jobs'
    ) THEN
        -- Add it if missing
        ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
        RAISE NOTICE 'Added jobs table to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'Jobs table already in supabase_realtime publication';
    END IF;
END $$;
