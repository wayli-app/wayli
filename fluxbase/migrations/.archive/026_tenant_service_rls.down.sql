--
-- Migration: 026_tenant_service_rls.down.sql
-- Description: Remove tenant_service RLS policies
-- Dependencies: 026_tenant_service_rls.up.sql
-- Created: 2026-05-03
--

SET search_path TO public;

DROP POLICY IF EXISTS "Tenant service full access to tracker_data" ON "public"."tracker_data";
DROP POLICY IF EXISTS "Tenant service full access to trips" ON "public"."trips";
DROP POLICY IF EXISTS "Tenant service full access to want_to_visit_places" ON "public"."want_to_visit_places";
DROP POLICY IF EXISTS "Tenant service full access to user_profiles" ON "public"."user_profiles";
DROP POLICY IF EXISTS "Tenant service full access to user_preferences" ON "public"."user_preferences";
DROP POLICY IF EXISTS "Tenant service full access to poi_embeddings" ON "public"."poi_embeddings";
DROP POLICY IF EXISTS "Tenant service full access to trip_embeddings" ON "public"."trip_embeddings";
DROP POLICY IF EXISTS "Tenant service full access to user_preference_vectors" ON "public"."user_preference_vectors";
DROP POLICY IF EXISTS "Tenant service full access to place_visits" ON "public"."place_visits";
DROP POLICY IF EXISTS "Tenant service full access to place_visits_state" ON "public"."place_visits_state";
DROP POLICY IF EXISTS "Tenant service full access to storage" ON "storage"."objects";

REVOKE ALL ON "public"."place_visits" FROM tenant_service;
REVOKE SELECT, UPDATE ON "public"."place_visits_state" FROM tenant_service;
REVOKE EXECUTE ON FUNCTION "public"."find_similar_users_by_preference" FROM tenant_service;
REVOKE EXECUTE ON FUNCTION "public"."refresh_place_visits" FROM tenant_service;
REVOKE USAGE ON SCHEMA auth FROM tenant_service;
REVOKE EXECUTE ON FUNCTION auth.uid() FROM tenant_service;
REVOKE EXECUTE ON FUNCTION auth.role() FROM tenant_service;
