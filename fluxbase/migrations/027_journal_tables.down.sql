-- 027: Rollback journal tables
DROP TABLE IF EXISTS trip_entries CASCADE;
ALTER TABLE trips DROP COLUMN IF EXISTS visibility;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS username;

-- Restore my_trips view without visibility
CREATE OR REPLACE VIEW "public"."my_trips"
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
    id,
    title,
    description,
    start_date,
    end_date,
    status,
    image_url,
    labels,
    metadata,
    (metadata->>'dataPoints')::integer as data_points,
    (metadata->>'tripDays')::integer as trip_days,
    metadata->>'primaryCity' as primary_city,
    metadata->>'primaryCountryCode' as primary_country_code,
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(metadata->'visitedCities')), ', ') as visited_cities,
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(metadata->'visitedCountryCodes')), ', ') as visited_country_codes,
    created_at,
    updated_at,
    start_date as started_at
FROM "public"."trips"
WHERE user_id = auth.uid() AND status IN ('active', 'planned', 'completed');
