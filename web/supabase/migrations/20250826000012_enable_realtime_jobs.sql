-- Enable Realtime for jobs table
-- This allows clients to subscribe to real-time updates for job status changes

-- Enable realtime publication for the jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER TABLE public.jobs REPLICA IDENTITY FULL;

-- Add comment explaining the realtime setup
COMMENT ON TABLE public.jobs IS 'Job queue table with realtime updates enabled. REPLICA IDENTITY FULL allows realtime to broadcast complete row data for updates.';
