-- Improve time-based sampling to reduce point density during car travel
-- Priority: Time-based sampling over distance-based sampling

CREATE OR REPLACE FUNCTION "public"."sample_tracker_data_if_needed"("p_target_user_id" "uuid", "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_max_points_threshold" integer DEFAULT 1000, "p_min_distance_meters" numeric DEFAULT 500, "p_min_time_minutes" numeric DEFAULT 5, "p_max_points_per_hour" integer DEFAULT 30, "p_offset" integer DEFAULT 0, "p_limit" integer DEFAULT 1000) RETURNS TABLE("result_user_id" "uuid", "result_tracker_type" "text", "result_device_id" "text", "result_recorded_at" timestamp with time zone, "result_location" "gis"."geometry", "result_country_code" character varying, "result_altitude" numeric, "result_accuracy" numeric, "result_speed" numeric, "result_distance" numeric, "result_time_spent" numeric, "result_heading" numeric, "result_battery_level" integer, "result_is_charging" boolean, "result_activity_type" "text", "result_geocode" "jsonb", "result_tz_diff" numeric, "result_created_at" timestamp with time zone, "result_updated_at" timestamp with time zone, "result_is_sampled" boolean, "result_total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE total_point_count BIGINT;
min_distance_degrees DECIMAL;
min_time_interval INTERVAL;
BEGIN -- Convert meters to degrees (approximate: 1 degree ≈ 111,000 meters)
min_distance_degrees := p_min_distance_meters / 111000.0;
min_time_interval := (p_min_time_minutes || ' minutes')::INTERVAL;
SELECT COUNT(*) INTO total_point_count
FROM public.tracker_data
WHERE user_id = p_target_user_id
    AND location IS NOT NULL
    AND (
        p_start_date IS NULL
        OR recorded_at >= p_start_date
    )
    AND (
        p_end_date IS NULL
        OR recorded_at <= p_end_date
    );
IF total_point_count <= p_max_points_threshold
OR (
    p_min_distance_meters = 0
    AND p_min_time_minutes = 0
) THEN RETURN QUERY
SELECT td.user_id as result_user_id,
    td.tracker_type as result_tracker_type,
    td.device_id as result_device_id,
    td.recorded_at as result_recorded_at,
    td.location as result_location,
    td.country_code as result_country_code,
    td.altitude as result_altitude,
    td.accuracy as result_accuracy,
    td.speed as result_speed,
    td.distance as result_distance,
    td.time_spent as result_time_spent,
    td.heading as result_heading,
    td.battery_level as result_battery_level,
    td.is_charging as result_is_charging,
    td.activity_type as result_activity_type,
    td.geocode as result_geocode,
    td.tz_diff as result_tz_diff,
    td.created_at as result_created_at,
    td.updated_at as result_updated_at,
    false as result_is_sampled,
    total_point_count as result_total_count
FROM public.tracker_data td
WHERE td.user_id = p_target_user_id
    AND td.location IS NOT NULL
    AND (
        p_start_date IS NULL
        OR td.recorded_at >= p_start_date
    )
    AND (
        p_end_date IS NULL
        OR td.recorded_at <= p_end_date
    )
ORDER BY td.recorded_at
LIMIT p_limit OFFSET p_offset;
ELSE -- Apply intelligent sampling with time-based priority
RETURN QUERY WITH ranked_points AS (
    SELECT td.user_id as result_user_id,
        td.tracker_type as result_tracker_type,
        td.device_id as result_device_id,
        td.recorded_at as result_recorded_at,
        td.location as result_location,
        td.country_code as result_country_code,
        td.altitude as result_altitude,
        td.accuracy as result_accuracy,
        td.speed as result_speed,
        td.distance as result_distance,
        td.time_spent as result_time_spent,
        td.heading as result_heading,
        td.battery_level as result_battery_level,
        td.is_charging as result_is_charging,
        td.activity_type as result_activity_type,
        td.geocode as result_geocode,
        td.tz_diff as result_tz_diff,
        td.created_at as result_created_at,
        td.updated_at as result_updated_at,
        -- Calculate distance from previous point
        CASE
            WHEN LAG(td.location) OVER (
                ORDER BY td.recorded_at
            ) IS NULL THEN 0
            ELSE public.st_distancesphere(
                LAG(td.location) OVER (
                    ORDER BY td.recorded_at
                ),
                td.location
            )
        END as distance_from_prev,
        -- Calculate time from previous point
        CASE
            WHEN LAG(td.recorded_at) OVER (
                ORDER BY td.recorded_at
            ) IS NULL THEN INTERVAL '0 seconds'
            ELSE td.recorded_at - LAG(td.recorded_at) OVER (
                ORDER BY td.recorded_at
            )
        END as time_from_prev,
        -- Calculate points per hour in sliding window
        COUNT(*) OVER (
            ORDER BY td.recorded_at RANGE BETWEEN INTERVAL '1 hour' PRECEDING
                AND CURRENT ROW
        ) as points_in_hour,
        -- Row number for sampling
        ROW_NUMBER() OVER (
            ORDER BY td.recorded_at
        ) as row_num
    FROM public.tracker_data td
    WHERE td.user_id = p_target_user_id
        AND td.location IS NOT NULL
        AND (
            p_start_date IS NULL
            OR td.recorded_at >= p_start_date
        )
        AND (
            p_end_date IS NULL
            OR td.recorded_at <= p_end_date
        )
),
sampled_points AS (
    SELECT rp.result_user_id,
        rp.result_tracker_type,
        rp.result_device_id,
        rp.result_recorded_at,
        rp.result_location,
        rp.result_country_code,
        rp.result_altitude,
        rp.result_accuracy,
        rp.result_speed,
        rp.result_distance,
        rp.result_time_spent,
        rp.result_heading,
        rp.result_battery_level,
        rp.result_is_charging,
        rp.result_activity_type,
        rp.result_geocode,
        rp.result_tz_diff,
        rp.result_created_at,
        rp.result_updated_at,
        rp.distance_from_prev,
        rp.time_from_prev,
        rp.points_in_hour,
        rp.row_num,
        -- Keep first and last points
        CASE
            WHEN rp.row_num = 1
            OR rp.row_num = total_point_count THEN true

            -- Prioritize time-based sampling: keep points with significant time gap
            -- This is the primary filter for reducing density
            WHEN rp.time_from_prev >= min_time_interval THEN true

            -- Secondary: keep points with significant movement only if also some time has passed
            -- Require at least 25% of the time interval to prevent excessive points during fast travel
            WHEN rp.distance_from_prev >= p_min_distance_meters
                AND rp.time_from_prev >= (min_time_interval * 0.25) THEN true

            -- Keep points if we're under the hourly limit (safety net)
            WHEN rp.points_in_hour <= p_max_points_per_hour THEN true

            -- Sample remaining points (keep every nth point)
            WHEN rp.row_num % CEIL(
                total_point_count::DECIMAL / p_max_points_threshold
            ) = 0 THEN true
            ELSE false
        END as should_keep
    FROM ranked_points rp
)
SELECT sp.result_user_id,
    sp.result_tracker_type,
    sp.result_device_id,
    sp.result_recorded_at,
    sp.result_location,
    sp.result_country_code,
    sp.result_altitude,
    sp.result_accuracy,
    sp.result_speed,
    sp.result_distance,
    sp.result_time_spent,
    sp.result_heading,
    sp.result_battery_level,
    sp.result_is_charging,
    sp.result_activity_type,
    sp.result_geocode,
    sp.result_tz_diff,
    sp.result_created_at,
    sp.result_updated_at,
    true as result_is_sampled,
    total_point_count as result_total_count
FROM sampled_points sp
WHERE sp.should_keep
ORDER BY sp.result_recorded_at
LIMIT p_limit OFFSET p_offset;
END IF;
END;
$$;
