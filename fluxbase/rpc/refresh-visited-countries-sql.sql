-- @fluxbase:description Rebuild the visited_countries cache: countries where the tracker dwelled at least one continuous hour (a >24h gap between consecutive points in a country starts a new stay), so flyovers and transit corridors don't count as visits. Replaces cached rows for the target user(s) wholesale. Called by the refresh-daily-activity jobs. user_id omitted → authenticated caller refreshes themselves; service roles may pass a user_id or omit it to refresh ALL users. ~1.5s per 300k points.
-- @fluxbase:require-role authenticated, service_role
-- @fluxbase:param user_id uuid?
-- @fluxbase:allowed-tables tracker_data, visited_countries
-- @fluxbase:max-execution-time 120s

-- Service roles may target an explicit user or everyone; authenticated callers
-- always act on themselves regardless of what they pass. The INSERT runs as a
-- data-modifying CTE (matches refresh-daily-activity-sql's shape) and the
-- outer SELECT just reports the row count.
WITH caller AS (
    SELECT CASE
        WHEN auth.jwt() ->> 'role' IN ('service_role', 'admin', 'tenant_service')
            THEN COALESCE($user_id::uuid, auth.uid())
        ELSE auth.uid()
    END AS uid,
    (auth.jwt() ->> 'role' IN ('service_role', 'admin', 'tenant_service') AND $user_id::uuid IS NULL)
        AS refresh_all
),
pts AS (
    SELECT td.user_id, td.country_code, td.recorded_at,
        CASE WHEN td.recorded_at - lag(td.recorded_at) OVER (
                 PARTITION BY td.user_id, td.country_code ORDER BY td.recorded_at)
                  > interval '24 hours' THEN 1 ELSE 0 END AS stay_break
    FROM public.tracker_data td, caller c
    WHERE (c.refresh_all OR td.user_id = c.uid)
      AND td.location IS NOT NULL
      AND td.country_code IS NOT NULL
),
marked AS (
    SELECT user_id, country_code, recorded_at,
        SUM(stay_break) OVER (PARTITION BY user_id, country_code ORDER BY recorded_at) AS stay_id
    FROM pts
),
stays AS (
    SELECT user_id, country_code, stay_id,
        min(recorded_at) AS stay_start,
        max(recorded_at) AS stay_end
    FROM marked
    GROUP BY user_id, country_code, stay_id
),
computed AS (
    SELECT user_id, country_code,
        min(stay_start) AS first_visit,
        max(stay_end) AS last_visit,
        count(*)::integer AS visits,
        round((SUM(EXTRACT(EPOCH FROM (stay_end - stay_start))) / 3600.0)::numeric, 2) AS total_stay_hours
    FROM stays
    GROUP BY user_id, country_code
    HAVING max(stay_end - stay_start) >= interval '1 hour'
),
replaced AS (
    DELETE FROM public.visited_countries vc
    USING caller c
    WHERE (c.refresh_all AND $user_id::uuid IS NULL)
       OR vc.user_id = c.uid
    RETURNING 1
),
upserted AS (
    INSERT INTO public.visited_countries
        (user_id, country_code, first_visit, last_visit, visits, total_stay_hours, updated_at)
    SELECT user_id, country_code, first_visit, last_visit, visits, total_stay_hours, NOW()
    FROM computed
    RETURNING 1
)
SELECT
    (SELECT COUNT(*) FROM replaced)::integer AS rows_deleted,
    (SELECT COUNT(*) FROM upserted)::integer AS countries_cached;
