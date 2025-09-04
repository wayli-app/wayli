-- Job System Migration
-- This migration creates the jobs and workers system for background processing

-- Create jobs table for background job processing
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    priority TEXT NOT NULL DEFAULT 'normal',
    data JSONB NOT NULL DEFAULT '{}',
    progress INTEGER NOT NULL DEFAULT 0,
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

-- Add constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'jobs_status_check'
        AND conrelid = 'public.jobs'::regclass
    ) THEN
        ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_status_check
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'jobs_priority_check'
        AND conrelid = 'public.jobs'::regclass
    ) THEN
        ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_priority_check
        CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'jobs_progress_check'
        AND conrelid = 'public.jobs'::regclass
    ) THEN
        ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_progress_check
        CHECK (progress >= 0 AND progress <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'workers_status_check'
        AND conrelid = 'public.workers'::regclass
    ) THEN
        ALTER TABLE public.workers
        ADD CONSTRAINT workers_status_check
        CHECK (status IN ('idle', 'busy', 'stopped'));
    END IF;
END $$;

-- Add comment for retry_count documentation
COMMENT ON COLUMN public.jobs.retry_count IS 'Number of retry attempts for this job';

-- Create workers table for worker management
CREATE TABLE IF NOT EXISTS public.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'idle',
    current_job UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for job system
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_priority ON public.jobs(priority);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_worker_id ON public.jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);
CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON public.workers(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_workers_updated_at ON public.workers(updated_at);

-- Function to update workers updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    SET search_path = public;
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

-- Function to create distance calculation jobs
CREATE OR REPLACE FUNCTION create_distance_calculation_job(
    target_user_id UUID,
    job_reason TEXT DEFAULT 'import_fallback'
)
RETURNS UUID AS $$
DECLARE
    job_id UUID;
BEGIN
    SET search_path = public;
    -- Insert the job using the correct column name (created_by instead of user_id)
    INSERT INTO public.jobs (
        type,
        status,
        priority,
        data,
        created_by
    ) VALUES (
        'distance_calculation',
        'queued',
        'low',
        jsonb_build_object(
            'type', 'distance_calculation',
            'target_user_id', target_user_id,
            'reason', job_reason,
            'created_at', now()
        ),
        target_user_id
    ) RETURNING id INTO job_id;

    RETURN job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_distance_calculation_job IS 'Safely creates a distance calculation job using the correct column names.';

-- Grant execute permission on the job functions
GRANT EXECUTE ON FUNCTION create_distance_calculation_job(UUID, TEXT) TO authenticated;

-- Grant necessary permissions on the jobs table
GRANT SELECT, INSERT, UPDATE ON public.jobs TO authenticated;
