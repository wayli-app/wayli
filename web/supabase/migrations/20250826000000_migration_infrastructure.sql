-- Migration Infrastructure Setup
-- This migration creates the necessary infrastructure for tracking and applying database migrations
-- Run this first before any other migrations

-- Enable required extensions
CREATE SCHEMA IF NOT EXISTS gis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA gis;
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA gis;

SET search_path TO public, gis;

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
CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    EXECUTE sql;
END;
$$;

-- Enable RLS on database_migrations table
ALTER TABLE public.database_migrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - only service role can access migrations table
CREATE POLICY "Service role can manage migrations" ON public.database_migrations
    FOR ALL USING ((SELECT auth.role()) = 'service_role');

-- Grant permissions to service_role
GRANT ALL ON public.database_migrations TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

-- Create wrapper functions for ST_DistanceSphere in public schema
CREATE OR REPLACE FUNCTION public.st_distancesphere(geom1 gis.geometry, geom2 gis.geometry)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT gis.ST_Distance(geom1::gis.geography, geom2::gis.geography);
$$;

-- Create overloaded version for gis.geography types
CREATE OR REPLACE FUNCTION public.st_distancesphere(geog1 gis.geography, geog2 gis.geography)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
    SELECT gis.ST_Distance(geog1, geog2);
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.st_distancesphere(gis.geometry, gis.geometry) TO authenticated;
GRANT EXECUTE ON FUNCTION public.st_distancesphere(gis.geography, gis.geography) TO authenticated;

-- Grant usage on gis schema to public and authenticated users
GRANT USAGE ON SCHEMA gis TO public;
GRANT USAGE ON SCHEMA gis TO authenticated;
