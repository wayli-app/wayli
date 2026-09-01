-- @fluxbase:description Countries the user has visited, from the visited_countries cache (rebuilt by the refresh-daily-activity job): countries with at least one continuous hour of tracker presence, so flyovers and transit corridors are excluded. Returns one row per country ordered by first visit. Empty result = cache not built yet; the frontend falls back to trip-metadata-derived countries.
-- @fluxbase:require-role authenticated
-- @fluxbase:input {}
-- @fluxbase:allowed-tables visited_countries
-- @fluxbase:max-execution-time 5s

SELECT
    country_code,
    first_visit,
    last_visit,
    visits::integer AS visits,
    total_stay_hours::float8 AS total_stay_hours
FROM public.visited_countries
WHERE user_id = auth.uid()
ORDER BY first_visit ASC;
