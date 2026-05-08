--
-- Migration: 026_tenant_service_rls.up.sql
-- Description: Add tenant_service RLS policies mirroring service_role access
--              Required for multi-tenant Fluxbase where fluxbaseService uses tenant_service
-- Dependencies: 018_tracker_data_admin_permissions, 021_fix_rls_policies
-- Created: 2026-05-03
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path TO public;

-- Grant auth function access to tenant_service
GRANT USAGE ON SCHEMA auth TO tenant_service;
GRANT EXECUTE ON FUNCTION auth.uid() TO tenant_service;
GRANT EXECUTE ON FUNCTION auth.role() TO tenant_service;

-- =============================================================================
-- TRACKER_DATA
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to tracker_data" ON "public"."tracker_data";

CREATE POLICY "Tenant service full access to tracker_data"
ON "public"."tracker_data"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- TRIPS
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to trips" ON "public"."trips";

CREATE POLICY "Tenant service full access to trips"
ON "public"."trips"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- WANT_TO_VISIT_PLACES
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to want_to_visit_places" ON "public"."want_to_visit_places";

CREATE POLICY "Tenant service full access to want_to_visit_places"
ON "public"."want_to_visit_places"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- USER_PROFILES
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to user_profiles" ON "public"."user_profiles";

CREATE POLICY "Tenant service full access to user_profiles"
ON "public"."user_profiles"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- USER_PREFERENCES
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to user_preferences" ON "public"."user_preferences";

CREATE POLICY "Tenant service full access to user_preferences"
ON "public"."user_preferences"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- POI_EMBEDDINGS
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to poi_embeddings" ON "public"."poi_embeddings";

CREATE POLICY "Tenant service full access to poi_embeddings"
ON "public"."poi_embeddings"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- TRIP_EMBEDDINGS
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to trip_embeddings" ON "public"."trip_embeddings";

CREATE POLICY "Tenant service full access to trip_embeddings"
ON "public"."trip_embeddings"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- USER_PREFERENCE_VECTORS
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to user_preference_vectors" ON "public"."user_preference_vectors";

CREATE POLICY "Tenant service full access to user_preference_vectors"
ON "public"."user_preference_vectors"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- PLACE_VISITS
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to place_visits" ON "public"."place_visits";

CREATE POLICY "Tenant service full access to place_visits"
ON "public"."place_visits"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- PLACE_VISITS_STATE
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to place_visits_state" ON "public"."place_visits_state";

CREATE POLICY "Tenant service full access to place_visits_state"
ON "public"."place_visits_state"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- STORAGE - tenant_service needs full access to all buckets
-- =============================================================================

DROP POLICY IF EXISTS "Tenant service full access to storage" ON "storage"."objects";

CREATE POLICY "Tenant service full access to storage"
ON "storage"."objects"
FOR ALL
TO tenant_service
USING (true)
WITH CHECK (true);

-- =============================================================================
-- TABLE GRANTS
-- =============================================================================

GRANT ALL ON "public"."place_visits" TO tenant_service;
GRANT SELECT, UPDATE ON "public"."place_visits_state" TO tenant_service;

-- =============================================================================
-- FUNCTION GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION "public"."find_similar_users_by_preference" TO tenant_service;
GRANT EXECUTE ON FUNCTION "public"."refresh_place_visits" TO tenant_service;
