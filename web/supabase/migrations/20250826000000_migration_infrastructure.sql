-- Migration Infrastructure Setup
-- This migration creates the necessary infrastructure for tracking and applying database migrations
-- Run this first before any other migrations

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS public.database_migrations (
    version VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    checksum VARCHAR(32) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,
    error_message TEXT
);

-- Create exec_sql function for running migrations
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID AS $$
BEGIN
    SET search_path = public;
    EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on database_migrations table
ALTER TABLE public.database_migrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - only service role can access migrations table
CREATE POLICY "Service role can manage migrations" ON public.database_migrations
    FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions to service_role
GRANT ALL ON public.database_migrations TO service_role;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
