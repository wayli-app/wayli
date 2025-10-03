SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
CREATE SCHEMA IF NOT EXISTS "gis";
ALTER SCHEMA "gis" OWNER TO "postgres";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
COMMENT ON SCHEMA "public" IS 'standard public schema';
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "gis";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION "public"."audit_user_role_change"() RETURNS "trigger" LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN IF OLD.role IS DISTINCT
FROM NEW.role THEN PERFORM log_audit_event(
        'user_role_change',
        format(
            'User role changed from %s to %s',
            OLD.role,
            NEW.role
        ),
        'high',
        jsonb_build_object(
            'user_id',
            NEW.id,
            'old_role',
            OLD.role,
            'new_role',
            NEW.role
        )
    );
END IF;
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."audit_user_role_change"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."calculate_distances_batch_v2"(
        "p_user_id" "uuid",
        "p_offset" integer,
        "p_limit" integer DEFAULT 1000
    ) RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE updated_count INTEGER := 0;
BEGIN -- Set timeout for batch processing
SET statement_timeout = '30s';
WITH batch AS (
    SELECT user_id,
        recorded_at,
        location
    FROM public.tracker_data
    WHERE user_id = p_user_id
        AND location IS NOT NULL
    ORDER BY recorded_at OFFSET p_offset
    LIMIT p_limit
), -- Calculate distances using LATERAL join to get previous record
calculations AS (
    SELECT b.user_id,
        b.recorded_at,
        COALESCE(
            public.st_distancesphere(prev.location, b.location),
            0
        ) AS distance,
        COALESCE(
            EXTRACT(
                EPOCH
                FROM (b.recorded_at - prev.recorded_at)
            ),
            0
        ) AS time_spent
    FROM batch b
        LEFT JOIN LATERAL (
            -- Find the actual previous record for this user
            -- This works because we're not limiting the search to the batch
            SELECT location,
                recorded_at
            FROM public.tracker_data
            WHERE user_id = b.user_id
                AND recorded_at < b.recorded_at
                AND location IS NOT NULL
            ORDER BY recorded_at DESC
            LIMIT 1
        ) prev ON true
) -- Update the records in this batch using composite primary key
UPDATE public.tracker_data t
SET distance = LEAST(ROUND(c.distance::numeric, 2), 9999999999.99),
    time_spent = LEAST(ROUND(c.time_spent::numeric, 2), 9999999999.99),
    speed = LEAST(
        ROUND(
            (
                CASE
                    WHEN c.time_spent > 0 THEN (c.distance / c.time_spent) * 3.6 -- Convert m/s to km/h
                    ELSE 0
                END
            )::numeric,
            2
        ),
        9999999999.99
    ),
    updated_at = NOW()
FROM calculations c
WHERE t.user_id = c.user_id
    AND t.recorded_at = c.recorded_at;
GET DIAGNOSTICS updated_count = ROW_COUNT;
RETURN updated_count;
END;
$$;
ALTER FUNCTION "public"."calculate_distances_batch_v2"(
    "p_user_id" "uuid",
    "p_offset" integer,
    "p_limit" integer
) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."calculate_distances_batch_v2"(
    "p_user_id" "uuid",
    "p_offset" integer,
    "p_limit" integer
) IS 'V2 distance calculation using chronological batch processing with offset. Processes records in order to ensure each record can find its previous record. Returns number of records updated.';
CREATE OR REPLACE FUNCTION "public"."calculate_mode_aware_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "transport_mode" "text" DEFAULT NULL::"text"
    ) RETURNS numeric LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE speed_result DECIMAL := 0;
window_size INTEGER;
point_count INTEGER;
valid_speeds DECIMAL [];
median_speed DECIMAL;
avg_speed DECIMAL;
mode_factor DECIMAL := 1.0;
BEGIN -- Adjust window size based on transport mode
CASE
    transport_mode
    WHEN 'walking' THEN window_size := 3;
WHEN 'cycling' THEN window_size := 4;
WHEN 'car' THEN window_size := 5;
WHEN 'train' THEN window_size := 7;
WHEN 'airplane' THEN window_size := 10;
ELSE window_size := 5;
END CASE
;
WITH point_window AS (
    SELECT location,
        recorded_at,
        public.st_distancesphere(
            LAG(location) OVER (
                ORDER BY recorded_at
            ),
            location
        ) AS distance,
        EXTRACT(
            EPOCH
            FROM (
                    recorded_at - LAG(recorded_at) OVER (
                        ORDER BY recorded_at
                    )
                )
        ) AS time_diff
    FROM tracker_data
    WHERE user_id = user_id_param
        AND location IS NOT NULL
        AND recorded_at BETWEEN (recorded_at_param - INTERVAL '15 minutes')
        AND (recorded_at_param + INTERVAL '15 minutes')
    ORDER BY recorded_at
),
speed_calculations AS (
    SELECT CASE
            WHEN time_diff > 0
            AND distance > 5 THEN -- Minimum 5m distance
            (distance / time_diff) * 3.6 -- Convert m/s to km/h
            ELSE NULL
        END AS speed_kmh
    FROM point_window
    WHERE distance IS NOT NULL
        AND time_diff IS NOT NULL
        AND time_diff > 0
        AND distance > 5
    ORDER BY recorded_at
    LIMIT window_size
)
SELECT ARRAY_AGG(
        speed_kmh
        ORDER BY speed_kmh
    ),
    COUNT(*) INTO valid_speeds,
    point_count
FROM speed_calculations
WHERE speed_kmh IS NOT NULL
    AND speed_kmh > 0
    AND speed_kmh < 1000;
IF point_count < 2 THEN RETURN 0;
END IF;
median_speed := valid_speeds [CEIL(point_count::DECIMAL / 2)];
SELECT AVG(speed) INTO avg_speed
FROM UNNEST(valid_speeds) AS speed;
CASE
    transport_mode
    WHEN 'walking' THEN mode_factor := 0.8;
WHEN 'cycling' THEN mode_factor := 0.9;
WHEN 'car' THEN mode_factor := 1.0;
WHEN 'train' THEN mode_factor := 1.1;
WHEN 'airplane' THEN mode_factor := 1.2;
ELSE mode_factor := 1.0;
END CASE
;
IF median_speed IS NOT NULL THEN speed_result := median_speed * mode_factor;
ELSIF avg_speed IS NOT NULL THEN speed_result := avg_speed * mode_factor;
ELSE speed_result := 0;
END IF;
speed_result := GREATEST(0, LEAST(speed_result, 1000));
RETURN ROUND(speed_result, 2);
END;
$$;
ALTER FUNCTION "public"."calculate_mode_aware_speed"(
    "user_id_param" "uuid",
    "recorded_at_param" timestamp with time zone,
    "transport_mode" "text"
) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."calculate_mode_aware_speed"(
    "user_id_param" "uuid",
    "recorded_at_param" timestamp with time zone,
    "transport_mode" "text"
) IS 'Calculates speed with transport mode awareness and appropriate window sizes';
CREATE OR REPLACE FUNCTION "public"."calculate_stable_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "window_size" integer DEFAULT 5
    ) RETURNS numeric LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE speed_result DECIMAL := 0;
point_count INTEGER;
valid_speeds DECIMAL [];
median_speed DECIMAL;
avg_speed DECIMAL;
outlier_threshold DECIMAL;
BEGIN -- Get points in window around the target point
WITH point_window AS (
    SELECT location,
        recorded_at,
        public.st_distancesphere(
            LAG(location) OVER (
                ORDER BY recorded_at
            ),
            location
        ) AS distance,
        EXTRACT(
            EPOCH
            FROM (
                    recorded_at - LAG(recorded_at) OVER (
                        ORDER BY recorded_at
                    )
                )
        ) AS time_diff
    FROM tracker_data
    WHERE user_id = user_id_param
        AND location IS NOT NULL
        AND recorded_at BETWEEN (recorded_at_param - INTERVAL '10 minutes')
        AND (recorded_at_param + INTERVAL '10 minutes')
    ORDER BY recorded_at
),
speed_calculations AS (
    SELECT CASE
            WHEN time_diff > 0
            AND distance > 10 THEN -- Minimum 10m distance
            (distance / time_diff) * 3.6 -- Convert m/s to km/h
            ELSE NULL
        END AS speed_kmh
    FROM point_window
    WHERE distance IS NOT NULL
        AND time_diff IS NOT NULL
        AND time_diff > 0
        AND distance > 10
    ORDER BY recorded_at
    LIMIT window_size
)
SELECT ARRAY_AGG(
        speed_kmh
        ORDER BY speed_kmh
    ),
    COUNT(*) INTO valid_speeds,
    point_count
FROM speed_calculations
WHERE speed_kmh IS NOT NULL
    AND speed_kmh > 0
    AND speed_kmh < 500;
IF point_count < 3 THEN RETURN 0;
END IF;
median_speed := valid_speeds [CEIL(point_count::DECIMAL / 2)];
SELECT AVG(speed) INTO avg_speed
FROM UNNEST(valid_speeds) AS speed;
WITH speed_stats AS (
    SELECT AVG(speed) as mean_speed,
        STDDEV(speed) as std_dev
    FROM UNNEST(valid_speeds) AS speed
)
SELECT mean_speed + (2 * std_dev) INTO outlier_threshold
FROM speed_stats;
IF median_speed IS NOT NULL
AND median_speed < outlier_threshold THEN speed_result := median_speed;
ELSIF avg_speed IS NOT NULL
AND avg_speed < outlier_threshold THEN speed_result := avg_speed;
ELSE -- If all speeds are outliers, use the most recent valid speed
speed_result := valid_speeds [ARRAY_LENGTH(valid_speeds, 1)];
END IF;
speed_result := GREATEST(0, LEAST(speed_result, 500));
RETURN ROUND(speed_result, 2);
END;
$$;
ALTER FUNCTION "public"."calculate_stable_speed"(
    "user_id_param" "uuid",
    "recorded_at_param" timestamp with time zone,
    "window_size" integer
) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."calculate_stable_speed"(
    "user_id_param" "uuid",
    "recorded_at_param" timestamp with time zone,
    "window_size" integer
) IS 'Calculates stable speed using multiple points and outlier filtering for noise reduction';
CREATE OR REPLACE FUNCTION "public"."cleanup_expired_exports"() RETURNS integer LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$
DECLARE deleted_count INTEGER := 0;
expired_job RECORD;
BEGIN -- Find expired export jobs
FOR expired_job IN
SELECT id,
    (data->>'file_path') as file_path
FROM public.jobs
WHERE type = 'data_export'
    AND (data->>'expires_at')::timestamp with time zone < NOW()
    AND data->>'file_path' IS NOT NULL LOOP -- Delete the file from storage
DELETE FROM storage.objects
WHERE name = expired_job.file_path
    AND bucket_id = 'exports';
DELETE FROM public.jobs
WHERE id = expired_job.id;
deleted_count := deleted_count + 1;
END LOOP;
RETURN deleted_count;
END;
$$;
ALTER FUNCTION "public"."cleanup_expired_exports"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_logs"("retention_days" integer DEFAULT 90) RETURNS integer LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$
DECLARE delete_count INTEGER;
BEGIN -- Enforce minimum retention period
IF retention_days < 30 THEN RAISE EXCEPTION 'Minimum audit log retention is 30 days, requested: % days',
retention_days;
END IF;
-- Delete old audit logs
DELETE FROM public.audit_logs
WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
GET DIAGNOSTICS delete_count = ROW_COUNT;
RETURN delete_count;
END;
$$;
ALTER FUNCTION "public"."cleanup_old_audit_logs"("retention_days" integer) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."cleanup_old_audit_logs"("retention_days" integer) IS 'Deletes audit logs older than specified days (minimum 30 days retention enforced)';
CREATE OR REPLACE FUNCTION "public"."create_distance_calculation_job"(
        "target_user_id" "uuid",
        "job_reason" "text" DEFAULT 'import_fallback'::"text"
    ) RETURNS "uuid" LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$
DECLARE job_id UUID;
BEGIN -- Insert the job using the correct column name (created_by instead of user_id)
INSERT INTO public.jobs (
        type,
        status,
        priority,
        data,
        created_by
    )
VALUES (
        'distance_calculation',
        'queued',
        'low',
        jsonb_build_object(
            'type',
            'distance_calculation',
            'target_user_id',
            target_user_id,
            'reason',
            job_reason,
            'created_at',
            now()
        ),
        target_user_id
    )
RETURNING id INTO job_id;
RETURN job_id;
END;
$$;
ALTER FUNCTION "public"."create_distance_calculation_job"("target_user_id" "uuid", "job_reason" "text") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."create_distance_calculation_job"("target_user_id" "uuid", "job_reason" "text") IS 'Safely creates a distance calculation job using the correct column names.';
CREATE OR REPLACE FUNCTION "public"."disable_tracker_data_trigger"() RETURNS "void" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$ BEGIN
ALTER TABLE public.tracker_data DISABLE TRIGGER tracker_data_distance_trigger;
RAISE NOTICE 'Disabled tracker_data_distance_trigger for bulk operations';
END;
$$;
ALTER FUNCTION "public"."disable_tracker_data_trigger"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."disable_tracker_data_trigger"() IS 'Temporarily disables distance calculation trigger for bulk operations';
CREATE OR REPLACE FUNCTION "public"."enable_tracker_data_trigger"() RETURNS "void" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$ BEGIN
ALTER TABLE public.tracker_data ENABLE TRIGGER tracker_data_distance_trigger;
RAISE NOTICE 'Enabled tracker_data_distance_trigger';
END;
$$;
ALTER FUNCTION "public"."enable_tracker_data_trigger"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."enable_tracker_data_trigger"() IS 'Re-enables distance calculation trigger after bulk operations';
CREATE OR REPLACE FUNCTION "public"."full_country"("country" "text") RETURNS "text" LANGUAGE "plpgsql" IMMUTABLE
SET "search_path" TO '' AS $$ BEGIN RETURN (
        SELECT value
        FROM json_each_text(
                '{
  "AF": "Afghanistan",
  "AL": "Albania",
  "DZ": "Algeria",
  "AS": "American Samoa",
  "AD": "Andorra",
  "AO": "Angola",
  "AI": "Anguilla",
  "AQ": "Antarctica",
  "AG": "Antigua and Barbuda",
  "AR": "Argentina",
  "AM": "Armenia",
  "AW": "Aruba",
  "AU": "Australia",
  "AT": "Austria",
  "AZ": "Azerbaijan",
  "BS": "Bahamas",
  "BH": "Bahrain",
  "BD": "Bangladesh",
  "BB": "Barbados",
  "BY": "Belarus",
  "BE": "Belgium",
  "BZ": "Belize",
  "BJ": "Benin",
  "BM": "Bermuda",
  "BT": "Bhutan",
  "BO": "Bolivia",
  "BQ": "Bonaire, Sint Eustatius and Saba",
  "BA": "Bosnia and Herzegovina",
  "BW": "Botswana",
  "BV": "Bouvet Island",
  "BR": "Brazil",
  "IO": "British Indian Ocean Territory",
  "BN": "Brunei Darussalam",
  "BG": "Bulgaria",
  "BF": "Burkina Faso",
  "BI": "Burundi",
  "CV": "Cabo Verde",
  "KH": "Cambodia",
  "CM": "Cameroon",
  "CA": "Canada",
  "KY": "Cayman Islands",
  "CF": "Central African Republic",
  "TD": "Chad",
  "CL": "Chile",
  "CN": "China",
  "CX": "Christmas Island",
  "CC": "Cocos (Keeling) Islands",
  "CO": "Colombia",
  "KM": "Comoros",
  "CG": "Congo",
  "CD": "Congo, Democratic Republic of the",
  "CK": "Cook Islands",
  "CR": "Costa Rica",
  "CI": "Côte d''Ivoire",
  "HR": "Croatia",
  "CU": "Cuba",
  "CW": "Curaçao",
  "CY": "Cyprus",
  "CZ": "Czech Republic",
  "DK": "Denmark",
  "DJ": "Djibouti",
  "DM": "Dominica",
  "DO": "Dominican Republic",
  "EC": "Ecuador",
  "EG": "Egypt",
  "SV": "El Salvador",
  "GQ": "Equatorial Guinea",
  "ER": "Eritrea",
  "EE": "Estonia",
  "SZ": "Eswatini",
  "ET": "Ethiopia",
  "FK": "Falkland Islands (Malvinas)",
  "FO": "Faroe Islands",
  "FJ": "Fiji",
  "FI": "Finland",
  "FR": "France",
  "GF": "French Guiana",
  "PF": "French Polynesia",
  "TF": "French Southern Territories",
  "GA": "Gabon",
  "GM": "Gambia",
  "GE": "Georgia",
  "DE": "Germany",
  "GH": "Ghana",
  "GI": "Gibraltar",
  "GR": "Greece",
  "GL": "Greenland",
  "GD": "Grenada",
  "GP": "Guadeloupe",
  "GU": "Guam",
  "GT": "Guatemala",
  "GG": "Guernsey",
  "GN": "Guinea",
  "GW": "Guinea-Bissau",
  "GY": "Guyana",
  "HT": "Haiti",
  "HM": "Heard Island and McDonald Islands",
  "VA": "Holy See (Vatican City State)",
  "HN": "Honduras",
  "HK": "Hong Kong",
  "HU": "Hungary",
  "IS": "Iceland",
  "IN": "India",
  "ID": "Indonesia",
  "IR": "Iran, Islamic Republic of",
  "IQ": "Iraq",
  "IE": "Ireland",
  "IM": "Isle of Man",
  "IL": "Israel",
  "IT": "Italy",
  "JM": "Jamaica",
  "JP": "Japan",
  "JE": "Jersey",
  "JO": "Jordan",
  "KZ": "Kazakhstan",
  "KE": "Kenya",
  "KI": "Kiribati",
  "KP": "Korea, Democratic People''s Republic of",
  "KR": "Korea, Republic of",
  "KW": "Kuwait",
  "KG": "Kyrgyzstan",
  "LA": "Lao People''s Democratic Republic",
  "LV": "Latvia",
  "LB": "Lebanon",
  "LS": "Lesotho",
  "LR": "Liberia",
  "LY": "Libya",
  "LI": "Liechtenstein",
  "LT": "Lithuania",
  "LU": "Luxembourg",
  "MO": "Macao",
  "MK": "North Macedonia",
  "MG": "Madagascar",
  "MW": "Malawi",
  "MY": "Malaysia",
  "MV": "Maldives",
  "ML": "Mali",
  "MT": "Malta",
  "MH": "Marshall Islands",
  "MQ": "Martinique",
  "MR": "Mauritania",
  "MU": "Mauritius",
  "YT": "Mayotte",
  "MX": "Mexico",
  "FM": "Micronesia, Federated States of",
  "MD": "Moldova, Republic of",
  "MC": "Monaco",
  "MN": "Mongolia",
  "ME": "Montenegro",
  "MS": "Montserrat",
  "MA": "Morocco",
  "MZ": "Mozambique",
  "MM": "Myanmar",
  "NA": "Namibia",
  "NR": "Nauru",
  "NP": "Nepal",
  "NL": "Netherlands",
  "NC": "New Caledonia",
  "NZ": "New Zealand",
  "NI": "Nicaragua",
  "NE": "Niger",
  "NG": "Nigeria",
  "NU": "Niue",
  "NF": "Norfolk Island",
  "MP": "Northern Mariana Islands",
  "NO": "Norway",
  "OM": "Oman",
  "PK": "Pakistan",
  "PW": "Palau",
  "PS": "Palestine, State of",
  "PA": "Panama",
  "PG": "Papua New Guinea",
  "PY": "Paraguay",
  "PE": "Peru",
  "PH": "Philippines",
  "PN": "Pitcairn",
  "PL": "Poland",
  "PT": "Portugal",
  "PR": "Puerto Rico",
  "QA": "Qatar",
  "RE": "Réunion",
  "RO": "Romania",
  "RU": "Russian Federation",
  "RW": "Rwanda",
  "BL": "Saint Barthélemy",
  "SH": "Saint Helena, Ascension and Tristan da Cunha",
  "KN": "Saint Kitts and Nevis",
  "LC": "Saint Lucia",
  "MF": "Saint Martin (French part)",
  "PM": "Saint Pierre and Miquelon",
  "VC": "Saint Vincent and the Grenadines",
  "WS": "Samoa",
  "SM": "San Marino",
  "ST": "Sao Tome and Principe",
  "SA": "Saudi Arabia",
  "SN": "Senegal",
  "RS": "Serbia",
  "SC": "Seychelles",
  "SL": "Sierra Leone",
  "SG": "Singapore",
  "SK": "Slovakia",
  "SI": "Slovenia",
  "SB": "Solomon Islands",
  "SO": "Somalia",
  "ZA": "South Africa",
  "GS": "South Georgia and the South Sandwich Islands",
  "SS": "South Sudan",
  "ES": "Spain",
  "LK": "Sri Lanka",
  "SD": "Sudan",
  "SR": "Suriname",
  "SJ": "Svalbard and Jan Mayen",
  "SZ": "Eswatini",
  "SE": "Sweden",
  "CH": "Switzerland",
  "SY": "Syrian Arab Republic",
  "TW": "Taiwan, Province of China",
  "TJ": "Tajikistan",
  "TZ": "Tanzania, United Republic of",
  "TH": "Thailand",
  "TL": "Timor-Leste",
  "TG": "Togo",
  "TK": "Tokelau",
  "TO": "Tonga",
  "TT": "Trinidad and Tobago",
  "TN": "Tunisia",
  "TR": "Turkey",
  "TM": "Turkmenistan",
  "TC": "Turks and Caicos Islands",
  "TV": "Tuvalu",
  "UG": "Uganda",
  "UA": "Ukraine",
  "AE": "United Arab Emirates",
  "GB": "United Kingdom",
  "US": "United States",
  "UM": "United States Minor Outlying Islands",
  "UY": "Uruguay",
  "UZ": "Uzbekistan",
  "VU": "Vanuatu",
  "VE": "Venezuela, Bolivarian Republic of",
  "VN": "Viet Nam",
  "VG": "Virgin Islands, British",
  "VI": "Virgin Islands, U.S.",
  "WF": "Wallis and Futuna",
  "EH": "Western Sahara",
  "YE": "Yemen",
  "ZM": "Zambia",
  "ZW": "Zimbabwe"
}'
            ) AS json_data(key, value)
        WHERE key = UPPER(country)
    );
END;
$$;
ALTER FUNCTION "public"."full_country"("country" "text") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."full_country"("country" "text") IS 'Maps ISO 3166-1 alpha-2 country codes to full country names';
CREATE OR REPLACE FUNCTION "public"."get_audit_statistics"(
        "start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
        "end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone
    ) RETURNS TABLE(
        "total_events" bigint,
        "events_by_type" "jsonb",
        "events_by_severity" "jsonb",
        "events_by_user" "jsonb"
    ) LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN -- Security check: Only admins can view system-wide audit statistics
    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = auth.uid()
            AND role = 'admin'
    )
    AND auth.role() != 'service_role' THEN RAISE EXCEPTION 'Unauthorized: Only admins can view audit statistics';
END IF;
RETURN QUERY WITH stats AS (
    SELECT COUNT(*) as total_events,
        jsonb_object_agg(event_type, count) as events_by_type,
        jsonb_object_agg(severity, count) as events_by_severity,
        jsonb_object_agg(user_id::text, count) as events_by_user
    FROM (
            SELECT event_type,
                severity,
                user_id,
                COUNT(*) as count
            FROM public.audit_logs
            WHERE (
                    start_date IS NULL
                    OR timestamp >= start_date
                )
                AND (
                    end_date IS NULL
                    OR timestamp <= end_date
                )
            GROUP BY event_type,
                severity,
                user_id
        ) event_stats
)
SELECT *
FROM stats;
END;
$$;
ALTER FUNCTION "public"."get_audit_statistics"(
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone
) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."get_audit_statistics"(
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone
) IS 'Returns system-wide audit statistics. Admin-only access enforced.';
CREATE OR REPLACE FUNCTION "public"."get_points_within_radius"(
        "center_lat" double precision,
        "center_lon" double precision,
        "radius_meters" double precision,
        "user_uuid" "uuid"
    ) RETURNS TABLE(
        "user_id" "uuid",
        "recorded_at" timestamp with time zone,
        "lat" double precision,
        "lon" double precision,
        "distance_meters" double precision
    ) LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN IF auth.uid() != user_uuid
    AND NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = auth.uid()
            AND role = 'admin'
    ) THEN RAISE EXCEPTION 'Unauthorized: You can only access your own tracking points';
END IF;
RETURN QUERY
SELECT td.user_id,
    td.recorded_at,
    gis.ST_Y(td.location::gis.geometry) as lat,
    gis.ST_X(td.location::gis.geometry) as lon,
    public.st_distancesphere(
        td.location,
        gis.ST_SetSRID(gis.ST_MakePoint(center_lon, center_lat), 4326)
    ) as distance_meters
FROM public.tracker_data td
WHERE td.user_id = user_uuid
    AND gis.ST_DWithin(
        td.location::gis.geography,
        gis.ST_SetSRID(gis.ST_MakePoint(center_lon, center_lat), 4326)::gis.geography,
        radius_meters
    )
ORDER BY td.recorded_at;
END;
$$;
ALTER FUNCTION "public"."get_points_within_radius"(
    "center_lat" double precision,
    "center_lon" double precision,
    "radius_meters" double precision,
    "user_uuid" "uuid"
) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_server_settings"() RETURNS TABLE(
        "server_name" "text",
        "admin_email" "text",
        "allow_registration" boolean,
        "require_email_verification" boolean
    ) LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN RETURN QUERY
SELECT ss.server_name,
    ss.admin_email,
    ss.allow_registration,
    ss.require_email_verification
FROM public.server_settings ss
LIMIT 1;
END;
$$;
ALTER FUNCTION "public"."get_server_settings"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_user_activity_summary"("p_user_id" "uuid", "p_days" integer DEFAULT 30) RETURNS TABLE(
        "total_events" bigint,
        "events_by_type" "jsonb",
        "events_by_severity" "jsonb",
        "last_activity" timestamp with time zone
    ) LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN IF auth.uid() != p_user_id
    AND NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = auth.uid()
            AND role = 'admin'
    ) THEN RAISE EXCEPTION 'Unauthorized: You can only access your own activity summary';
END IF;
RETURN QUERY
SELECT COUNT(*) as total_events,
    jsonb_object_agg(event_type, count) as events_by_type,
    jsonb_object_agg(severity, count) as events_by_severity,
    MAX(timestamp) as last_activity
FROM (
        SELECT event_type,
            severity,
            COUNT(*) as count
        FROM public.audit_logs
        WHERE user_id = p_user_id
            AND timestamp >= NOW() - INTERVAL '1 day' * p_days
        GROUP BY event_type,
            severity
    ) user_stats;
END;
$$;
ALTER FUNCTION "public"."get_user_activity_summary"("p_user_id" "uuid", "p_days" integer) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."get_user_tracking_data"(
        "user_uuid" "uuid",
        "start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
        "end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
        "limit_count" integer DEFAULT 1000
    ) RETURNS TABLE(
        "user_id" "uuid",
        "recorded_at" timestamp with time zone,
        "lat" double precision,
        "lon" double precision,
        "altitude" numeric,
        "accuracy" numeric,
        "speed" numeric,
        "activity_type" "text",
        "geocode" "jsonb",
        "distance" numeric,
        "time_spent" numeric
    ) LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN IF auth.uid() != user_uuid
    AND NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = auth.uid()
            AND role = 'admin'
    ) THEN RAISE EXCEPTION 'Unauthorized: You can only access your own tracking data';
END IF;
RETURN QUERY
SELECT td.user_id,
    td.recorded_at,
    gis.ST_Y(td.location::gis.geometry) as lat,
    gis.ST_X(td.location::gis.geometry) as lon,
    td.altitude,
    td.accuracy,
    td.speed,
    td.activity_type,
    td.geocode,
    td.distance,
    td.time_spent
FROM public.tracker_data td
WHERE td.user_id = user_uuid
    AND (
        start_date IS NULL
        OR td.recorded_at >= start_date
    )
    AND (
        end_date IS NULL
        OR td.recorded_at <= end_date
    )
ORDER BY td.recorded_at ASC -- Changed to ASC for proper distance calculation
LIMIT limit_count;
END;
$$;
ALTER FUNCTION "public"."get_user_tracking_data"(
    "user_uuid" "uuid",
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "limit_count" integer
) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger" LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$
DECLARE user_role TEXT;
first_name TEXT;
last_name TEXT;
full_name TEXT;
BEGIN -- Extract name information from user metadata
first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
IF full_name = ''
AND (
    first_name != ''
    OR last_name != ''
) THEN IF first_name != ''
AND last_name != '' THEN full_name := first_name || ' ' || last_name;
ELSIF first_name != '' THEN full_name := first_name;
ELSIF last_name != '' THEN full_name := last_name;
END IF;
END IF;
first_name := TRIM(first_name);
last_name := TRIM(last_name);
full_name := TRIM(full_name);
INSERT INTO public.user_profiles (
        id,
        first_name,
        last_name,
        full_name,
        role,
        created_at,
        updated_at
    )
VALUES (
        NEW.id,
        first_name,
        last_name,
        full_name,
        -- Atomic check: First user becomes admin, prevents race condition
        CASE
            WHEN NOT EXISTS (
                SELECT 1
                FROM public.user_profiles
                LIMIT 1
                FOR UPDATE
            ) THEN 'admin'
            ELSE 'user'
        END,
        NOW(),
        NOW()
    );
INSERT INTO public.user_preferences (
        id,
        created_at,
        updated_at
    )
VALUES (
        NEW.id,
        NOW(),
        NOW()
    );
RAISE NOTICE 'Successfully created profile and preferences for user: %',
NEW.id;
RETURN NEW;
EXCEPTION
WHEN OTHERS THEN RAISE WARNING 'Error in handle_new_user for user %: % %',
NEW.id,
SQLERRM,
SQLSTATE;
RAISE;
END;
$$;
ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Trigger function to create user_profiles and user_preferences entries for new users.
    First user is automatically assigned admin role using atomic row-level locking to prevent race conditions.
    Uses empty search_path for security (SECURITY DEFINER function).';
CREATE OR REPLACE FUNCTION "public"."is_user_admin"("user_uuid" "uuid") RETURNS boolean LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$
DECLARE user_role TEXT;
BEGIN
SELECT role INTO user_role
FROM public.user_profiles
WHERE id = user_uuid;
RETURN user_role = 'admin';
END;
$$;
ALTER FUNCTION "public"."is_user_admin"("user_uuid" "uuid") OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."log_audit_event"(
        "p_event_type" "text",
        "p_description" "text",
        "p_severity" "text" DEFAULT 'low'::"text",
        "p_metadata" "jsonb" DEFAULT '{}'::"jsonb"
    ) RETURNS "void" LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN
INSERT INTO public.audit_logs (
        user_id,
        event_type,
        severity,
        description,
        metadata,
        timestamp
    )
VALUES (
        (
            SELECT auth.uid()
        ),
        p_event_type,
        p_severity,
        p_description,
        p_metadata,
        NOW()
    );
END;
$$;
ALTER FUNCTION "public"."log_audit_event"(
    "p_event_type" "text",
    "p_description" "text",
    "p_severity" "text",
    "p_metadata" "jsonb"
) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."perform_bulk_import_with_distance_calculation"("target_user_id" "uuid") RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE updated_count INTEGER;
BEGIN RAISE NOTICE 'Starting bulk import optimization for user %...',
target_user_id;
PERFORM disable_tracker_data_trigger();
SELECT update_tracker_distances(target_user_id) INTO updated_count;
PERFORM enable_tracker_data_trigger();
RAISE NOTICE 'Bulk import optimization complete for user %. Updated % records.',
target_user_id,
updated_count;
RETURN updated_count;
END;
$$;
ALTER FUNCTION "public"."perform_bulk_import_with_distance_calculation"("target_user_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."perform_bulk_import_with_distance_calculation"("target_user_id" "uuid") IS 'Optimized bulk import helper that disables triggers, calculates distances, and re-enables triggers';
CREATE OR REPLACE FUNCTION "public"."remove_duplicate_tracking_points"("target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE deleted_count INTEGER := 0;
BEGIN -- Delete duplicates, keeping the most recent record (highest created_at)
WITH duplicates AS (
    SELECT ctid,
        ROW_NUMBER() OVER (
            PARTITION BY user_id,
            recorded_at
            ORDER BY created_at DESC,
                ctid DESC
        ) as rn
    FROM public.tracker_data
    WHERE (
            target_user_id IS NULL
            OR user_id = target_user_id
        )
)
DELETE FROM public.tracker_data
WHERE ctid IN (
        SELECT ctid
        FROM duplicates
        WHERE rn > 1
    );
GET DIAGNOSTICS deleted_count = ROW_COUNT;
RETURN deleted_count;
END;
$$;
ALTER FUNCTION "public"."remove_duplicate_tracking_points"("target_user_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."remove_duplicate_tracking_points"("target_user_id" "uuid") IS 'Removes duplicate tracking points, keeping the most recent record for each unique (user_id, recorded_at) combination';
CREATE OR REPLACE FUNCTION "public"."sample_tracker_data_if_needed"(
        "p_target_user_id" "uuid",
        "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
        "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone,
        "p_max_points_threshold" integer DEFAULT 1000,
        "p_min_distance_meters" numeric DEFAULT 500,
        "p_min_time_minutes" numeric DEFAULT 5,
        "p_max_points_per_hour" integer DEFAULT 30,
        "p_offset" integer DEFAULT 0,
        "p_limit" integer DEFAULT 1000
    ) RETURNS TABLE(
        "result_user_id" "uuid",
        "result_tracker_type" "text",
        "result_device_id" "text",
        "result_recorded_at" timestamp with time zone,
        "result_location" "gis"."geometry",
        "result_country_code" character varying,
        "result_altitude" numeric,
        "result_accuracy" numeric,
        "result_speed" numeric,
        "result_distance" numeric,
        "result_time_spent" numeric,
        "result_heading" numeric,
        "result_battery_level" integer,
        "result_is_charging" boolean,
        "result_activity_type" "text",
        "result_geocode" "jsonb",
        "result_tz_diff" numeric,
        "result_created_at" timestamp with time zone,
        "result_updated_at" timestamp with time zone,
        "result_is_sampled" boolean,
        "result_total_count" bigint
    ) LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$
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
ELSE -- Apply intelligent sampling
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
            OR rp.row_num = total_point_count THEN true -- Keep points with significant movement
            WHEN rp.distance_from_prev >= p_min_distance_meters THEN true -- Keep points with significant time gap
            WHEN rp.time_from_prev >= min_time_interval THEN true -- Keep points if we're under the hourly limit
            WHEN rp.points_in_hour <= p_max_points_per_hour THEN true -- Sample remaining points (keep every nth point)
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
WHERE sp.should_keep = true
ORDER BY sp.result_recorded_at
LIMIT p_limit OFFSET p_offset;
END IF;
END;
$$;
ALTER FUNCTION "public"."sample_tracker_data_if_needed"(
    "p_target_user_id" "uuid",
    "p_start_date" timestamp with time zone,
    "p_end_date" timestamp with time zone,
    "p_max_points_threshold" integer,
    "p_min_distance_meters" numeric,
    "p_min_time_minutes" numeric,
    "p_max_points_per_hour" integer,
    "p_offset" integer,
    "p_limit" integer
) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."sample_tracker_data_if_needed"(
    "p_target_user_id" "uuid",
    "p_start_date" timestamp with time zone,
    "p_end_date" timestamp with time zone,
    "p_max_points_threshold" integer,
    "p_min_distance_meters" numeric,
    "p_min_time_minutes" numeric,
    "p_max_points_per_hour" integer,
    "p_offset" integer,
    "p_limit" integer
) IS 'Intelligently samples tracker data when point count exceeds threshold. Uses dynamic spatial-temporal sampling with configurable parameters that become more aggressive for larger datasets.';
CREATE OR REPLACE FUNCTION "public"."st_distancesphere"(
        "geog1" "gis"."geography",
        "geog2" "gis"."geography"
    ) RETURNS double precision LANGUAGE "sql" IMMUTABLE STRICT
SET "search_path" TO '' AS $$
SELECT gis.ST_Distance(geog1, geog2);
$$;
ALTER FUNCTION "public"."st_distancesphere"(
    "geog1" "gis"."geography",
    "geog2" "gis"."geography"
) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."st_distancesphere"(
        "geom1" "gis"."geometry",
        "geom2" "gis"."geometry"
    ) RETURNS double precision LANGUAGE "sql" IMMUTABLE STRICT
SET "search_path" TO '' AS $$
SELECT gis.ST_Distance(geom1::gis.geography, geom2::gis.geography);
$$;
ALTER FUNCTION "public"."st_distancesphere"(
    "geom1" "gis"."geometry",
    "geom2" "gis"."geometry"
) OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."trigger_calculate_distance"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE prev_point RECORD;
calculated_distance DECIMAL;
calculated_time_spent DECIMAL;
stable_speed DECIMAL;
BEGIN -- Only calculate if location is provided
IF NEW.location IS NOT NULL THEN -- Find the previous point for this user based on recorded_at
SELECT location,
    recorded_at INTO prev_point
FROM public.tracker_data
WHERE user_id = NEW.user_id
    AND recorded_at < NEW.recorded_at
    AND location IS NOT NULL
ORDER BY recorded_at DESC
LIMIT 1;
IF prev_point IS NOT NULL THEN -- Calculate distance from previous point
calculated_distance := public.st_distancesphere(prev_point.location, NEW.location);
NEW.distance := calculated_distance;
calculated_time_spent := EXTRACT(
    EPOCH
    FROM (NEW.recorded_at - prev_point.recorded_at)
);
NEW.time_spent := calculated_time_spent;
IF calculated_time_spent > 0 THEN stable_speed := (calculated_distance / calculated_time_spent) * 3.6;
ELSE stable_speed := 0;
END IF;
NEW.speed := LEAST(ROUND(stable_speed::numeric, 2), 9999999999.99);
ELSE -- First point for this user - set distance and time_spent to 0
NEW.distance := 0;
NEW.time_spent := 0;
NEW.speed := 0;
END IF;
NEW.updated_at := NOW();
END IF;
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."trigger_calculate_distance"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."trigger_calculate_distance"() IS 'Trigger function to automatically calculate distance and time_spent for new tracker_data records';
CREATE OR REPLACE FUNCTION "public"."trigger_calculate_distance_enhanced"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE prev_point RECORD;
calculated_distance DECIMAL;
calculated_time_spent DECIMAL;
stable_speed DECIMAL;
BEGIN -- Only calculate if location is provided
IF NEW.location IS NOT NULL THEN -- Find the previous point for this user based on recorded_at
SELECT location,
    recorded_at INTO prev_point
FROM public.tracker_data
WHERE user_id = NEW.user_id
    AND recorded_at < NEW.recorded_at
    AND location IS NOT NULL
ORDER BY recorded_at DESC
LIMIT 1;
IF prev_point IS NOT NULL THEN -- Calculate distance from previous point
calculated_distance := public.st_distancesphere(prev_point.location, NEW.location);
NEW.distance := calculated_distance;
calculated_time_spent := EXTRACT(
    EPOCH
    FROM (NEW.recorded_at - prev_point.recorded_at)
);
NEW.time_spent := calculated_time_spent;
IF calculated_time_spent > 0 THEN stable_speed := (calculated_distance / calculated_time_spent) * 3.6;
ELSE stable_speed := 0;
END IF;
NEW.speed := LEAST(ROUND(stable_speed::numeric, 2), 9999999999.99);
ELSE -- First point for this user - set distance and time_spent to 0
NEW.distance := 0;
NEW.time_spent := 0;
NEW.speed := 0;
END IF;
END IF;
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."trigger_calculate_distance_enhanced"() OWNER TO "postgres";
COMMENT ON FUNCTION "public"."trigger_calculate_distance_enhanced"() IS 'Enhanced trigger that uses stable speed calculation for new records';
CREATE OR REPLACE FUNCTION "public"."update_audit_logs_updated_at"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."update_audit_logs_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_tracker_distances"("target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $_$
DECLARE total_updated INTEGER := 0;
batch_size INTEGER := 1000;
batch_updated INTEGER;
has_more_records BOOLEAN := TRUE;
user_filter TEXT := '';
BEGIN
SET LOCAL statement_timeout = '30min';
IF target_user_id IS NOT NULL THEN RAISE NOTICE 'Starting enhanced distance and speed calculation for user %...',
target_user_id;
user_filter := ' AND t1.user_id = $1';
ELSE RAISE NOTICE 'Starting enhanced distance and speed calculation for ALL users...';
END IF;
WHILE has_more_records LOOP -- Use enhanced speed calculation with multi-point window
WITH distance_and_time_calculations AS (
    SELECT t1.user_id,
        t1.recorded_at,
        t1.location,
        CASE
            WHEN LAG(t1.location) OVER (
                PARTITION BY t1.user_id
                ORDER BY t1.recorded_at
            ) IS NULL THEN 0
            ELSE public.st_distancesphere(
                LAG(t1.location) OVER (
                    PARTITION BY t1.user_id
                    ORDER BY t1.recorded_at
                ),
                t1.location
            )
        END AS calculated_distance,
        CASE
            WHEN LAG(t1.recorded_at) OVER (
                PARTITION BY t1.user_id
                ORDER BY t1.recorded_at
            ) IS NULL THEN 0
            ELSE EXTRACT(
                EPOCH
                FROM (
                        t1.recorded_at - LAG(t1.recorded_at) OVER (
                            PARTITION BY t1.user_id
                            ORDER BY t1.recorded_at
                        )
                    )
            )
        END AS calculated_time_spent
    FROM public.tracker_data t1
    WHERE t1.location IS NOT NULL
        AND (
            t1.distance IS NULL
            OR t1.distance = 0
        )
        AND (
            target_user_id IS NULL
            OR t1.user_id = target_user_id
        )
    ORDER BY t1.user_id,
        t1.recorded_at
    LIMIT batch_size
)
UPDATE public.tracker_data AS td
SET distance = LEAST(
        ROUND(dc.calculated_distance::numeric, 2),
        9999999999.99
    ),
    time_spent = LEAST(
        ROUND(dc.calculated_time_spent::numeric, 2),
        9999999999.99
    ),
    -- Calculate simple speed (distance / time)
    speed = LEAST(
        ROUND(
            (
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (
                        dc.calculated_distance / dc.calculated_time_spent
                    ) * 3.6
                    ELSE 0
                END
            )::numeric,
            2
        ),
        9999999999.99
    ),
    updated_at = NOW()
FROM distance_and_time_calculations dc
WHERE td.user_id = dc.user_id
    AND td.recorded_at = dc.recorded_at;
GET DIAGNOSTICS batch_updated = ROW_COUNT;
IF batch_updated = 0 THEN has_more_records := FALSE;
ELSE total_updated := total_updated + batch_updated;
RAISE NOTICE 'Updated % records in batch. Total updated: %',
batch_updated,
total_updated;
END IF;
END LOOP;
IF target_user_id IS NOT NULL THEN RAISE NOTICE 'Enhanced distance and speed calculation complete for user %. Updated % records.',
target_user_id,
total_updated;
ELSE RAISE NOTICE 'Enhanced distance and speed calculation complete for ALL users. Updated % records.',
total_updated;
END IF;
RETURN total_updated;
END;
$_$;
ALTER FUNCTION "public"."update_tracker_distances"("target_user_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."update_tracker_distances"("target_user_id" "uuid") IS 'Enhanced version that uses stable speed calculation with multi-point windows for better accuracy';
CREATE OR REPLACE FUNCTION "public"."update_tracker_distances_batch"(
        "target_user_id" "uuid" DEFAULT NULL::"uuid",
        "batch_size" integer DEFAULT 1000
    ) RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $_$
DECLARE total_updated INTEGER := 0;
batch_updated INTEGER;
user_filter TEXT := '';
has_more_records BOOLEAN := TRUE;
start_time TIMESTAMP := clock_timestamp();
max_execution_time INTERVAL := INTERVAL '5 minutes';
BEGIN -- Set shorter timeout for this function to prevent long-running operations
SET statement_timeout = '300s';
IF clock_timestamp() - start_time > max_execution_time THEN RAISE NOTICE 'Function execution time limit approaching, returning partial results';
RETURN total_updated;
END IF;
IF target_user_id IS NOT NULL THEN user_filter := ' AND t1.user_id = $1';
END IF;
RAISE NOTICE 'Starting optimized distance calculation for records without distances (batch size: %)',
batch_size;
WHILE has_more_records
AND (clock_timestamp() - start_time) < max_execution_time LOOP -- Process only records that don't have distance calculated yet
WITH distance_and_time_calculations AS (
    SELECT t1.user_id,
        t1.recorded_at,
        t1.location,
        CASE
            WHEN LAG(t1.location) OVER (
                PARTITION BY t1.user_id
                ORDER BY t1.recorded_at
            ) IS NULL THEN 0
            ELSE public.st_distancesphere(
                LAG(t1.location) OVER (
                    PARTITION BY t1.user_id
                    ORDER BY t1.recorded_at
                ),
                t1.location
            )
        END AS calculated_distance,
        CASE
            WHEN LAG(t1.recorded_at) OVER (
                PARTITION BY t1.user_id
                ORDER BY t1.recorded_at
            ) IS NULL THEN 0
            ELSE EXTRACT(
                EPOCH
                FROM (
                        t1.recorded_at - LAG(t1.recorded_at) OVER (PARTITION BY t1.recorded_at)
                    )
            )
        END AS calculated_time_spent
    FROM public.tracker_data t1
    WHERE t1.location IS NOT NULL
        AND (
            t1.distance IS NULL
            OR t1.distance = 0
        ) -- Only process records without distance
        AND (
            target_user_id IS NULL
            OR t1.user_id = target_user_id
        )
    ORDER BY t1.user_id,
        t1.recorded_at
    LIMIT batch_size
)
UPDATE public.tracker_data AS td
SET distance = LEAST(
        ROUND(dc.calculated_distance::numeric, 2),
        9999999999.99
    ),
    time_spent = LEAST(
        ROUND(dc.calculated_time_spent::numeric, 2),
        9999999999.99
    ),
    speed = LEAST(
        ROUND(
            (
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (
                        dc.calculated_distance / dc.calculated_time_spent
                    )
                    ELSE 0
                END
            )::numeric,
            2
        ),
        9999999999.99
    )
FROM distance_and_time_calculations dc
WHERE td.user_id = dc.user_id
    AND td.recorded_at = dc.recorded_at;
GET DIAGNOSTICS batch_updated = ROW_COUNT;
IF batch_updated = 0 THEN has_more_records := FALSE;
ELSE total_updated := total_updated + batch_updated;
RAISE NOTICE 'Processed batch: % records, total: %',
batch_updated,
total_updated;
IF (clock_timestamp() - start_time) >= max_execution_time THEN RAISE NOTICE 'Execution time limit reached, returning partial results: % records updated',
total_updated;
has_more_records := FALSE;
ELSE -- Small delay to prevent overwhelming the database
PERFORM pg_sleep(0.05);
END IF;
END IF;
END LOOP;
RAISE NOTICE 'Optimized distance calculation completed: % total records updated in %',
total_updated,
clock_timestamp() - start_time;
RETURN total_updated;
END;
$_$;
ALTER FUNCTION "public"."update_tracker_distances_batch"("target_user_id" "uuid", "batch_size" integer) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."update_tracker_distances_batch"("target_user_id" "uuid", "batch_size" integer) IS 'Updates distance and time_spent columns in optimized batches for large datasets. Includes execution time limits and improved performance.';
CREATE OR REPLACE FUNCTION "public"."update_tracker_distances_enhanced"("target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $_$
DECLARE total_updated INTEGER;
user_filter TEXT := '';
batch_size INTEGER := 1000;
batch_updated INTEGER;
has_more_records BOOLEAN := TRUE;
BEGIN
SET LOCAL statement_timeout = '30min';
IF target_user_id IS NOT NULL THEN RAISE NOTICE 'Starting enhanced distance and speed calculation for user %...',
target_user_id;
user_filter := ' AND t1.user_id = $1';
ELSE RAISE NOTICE 'Starting enhanced distance and speed calculation for ALL users...';
END IF;
total_updated := 0;
WHILE has_more_records LOOP -- Use enhanced speed calculation with multi-point window
WITH distance_and_time_calculations AS (
    SELECT t1.user_id,
        t1.recorded_at,
        t1.location,
        CASE
            WHEN LAG(t1.location) OVER (
                PARTITION BY t1.user_id
                ORDER BY t1.recorded_at
            ) IS NULL THEN 0
            ELSE public.st_distancesphere(
                LAG(t1.location) OVER (
                    PARTITION BY t1.user_id
                    ORDER BY t1.recorded_at
                ),
                t1.location
            )
        END AS calculated_distance,
        CASE
            WHEN LAG(t1.recorded_at) OVER (
                PARTITION BY t1.user_id
                ORDER BY t1.recorded_at
            ) IS NULL THEN 0
            ELSE EXTRACT(
                EPOCH
                FROM (
                        t1.recorded_at - LAG(t1.recorded_at) OVER (
                            PARTITION BY t1.user_id
                            ORDER BY t1.recorded_at
                        )
                    )
            )
        END AS calculated_time_spent
    FROM public.tracker_data t1
    WHERE t1.location IS NOT NULL
        AND (
            t1.distance IS NULL
            OR t1.distance = 0
        )
        AND (
            target_user_id IS NULL
            OR t1.user_id = target_user_id
        )
    ORDER BY t1.user_id,
        t1.recorded_at
    LIMIT batch_size
)
UPDATE public.tracker_data AS td
SET distance = LEAST(
        ROUND(dc.calculated_distance::numeric, 2),
        9999999999.99
    ),
    time_spent = LEAST(
        ROUND(dc.calculated_time_spent::numeric, 2),
        9999999999.99
    ),
    -- Calculate simple speed (distance / time)
    speed = LEAST(
        ROUND(
            (
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (
                        dc.calculated_distance / dc.calculated_time_spent
                    ) * 3.6
                    ELSE 0
                END
            )::numeric,
            2
        ),
        9999999999.99
    ),
    updated_at = NOW()
FROM distance_and_time_calculations dc
WHERE td.user_id = dc.user_id
    AND td.recorded_at = dc.recorded_at;
GET DIAGNOSTICS batch_updated = ROW_COUNT;
IF batch_updated = 0 THEN has_more_records := FALSE;
ELSE total_updated := total_updated + batch_updated;
RAISE NOTICE 'Updated % records in batch. Total updated: %',
batch_updated,
total_updated;
END IF;
END LOOP;
IF target_user_id IS NOT NULL THEN RAISE NOTICE 'Enhanced distance and speed calculation complete for user %. Updated % records.',
target_user_id,
total_updated;
ELSE RAISE NOTICE 'Enhanced distance and speed calculation complete for ALL users. Updated % records.',
total_updated;
END IF;
RETURN total_updated;
END;
$_$;
ALTER FUNCTION "public"."update_tracker_distances_enhanced"("target_user_id" "uuid") OWNER TO "postgres";
COMMENT ON FUNCTION "public"."update_tracker_distances_enhanced"("target_user_id" "uuid") IS 'Enhanced version that uses stable speed calculation with multi-point windows';
CREATE OR REPLACE FUNCTION "public"."update_tracker_distances_small_batch"(
        "target_user_id" "uuid" DEFAULT NULL::"uuid",
        "max_records" integer DEFAULT 100
    ) RETURNS integer LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$
DECLARE total_updated INTEGER := 0;
BEGIN -- Set very short timeout
SET statement_timeout = '30s';
WITH records_needing_update AS (
    -- Get records that need distance calculation
    SELECT user_id,
        recorded_at
    FROM public.tracker_data
    WHERE location IS NOT NULL
        AND (
            distance IS NULL
            OR distance = 0
        )
        AND (
            target_user_id IS NULL
            OR user_id = target_user_id
        )
    ORDER BY user_id,
        recorded_at
    LIMIT max_records
), distance_and_time_calculations AS (
    -- Calculate distances for those records, but query ALL records for the user
    -- to ensure LAG() has the data it needs
    SELECT t1.user_id,
        t1.recorded_at,
        CASE
            WHEN prev.location IS NULL THEN 0
            ELSE public.st_distancesphere(prev.location, t1.location)
        END AS calculated_distance,
        CASE
            WHEN prev.recorded_at IS NULL THEN 0
            ELSE EXTRACT(
                EPOCH
                FROM (t1.recorded_at - prev.recorded_at)
            )
        END AS calculated_time_spent
    FROM public.tracker_data t1 -- Self-join to get previous record for each user
        LEFT JOIN LATERAL (
            SELECT location,
                recorded_at
            FROM public.tracker_data
            WHERE user_id = t1.user_id
                AND recorded_at < t1.recorded_at
                AND location IS NOT NULL
            ORDER BY recorded_at DESC
            LIMIT 1
        ) prev ON true
    WHERE EXISTS (
            SELECT 1
            FROM records_needing_update rnu
            WHERE rnu.user_id = t1.user_id
                AND rnu.recorded_at = t1.recorded_at
        )
)
UPDATE public.tracker_data AS td
SET distance = LEAST(
        ROUND(dc.calculated_distance::numeric, 2),
        9999999999.99
    ),
    time_spent = LEAST(
        ROUND(dc.calculated_time_spent::numeric, 2),
        9999999999.99
    ),
    speed = LEAST(
        ROUND(
            (
                CASE
                    WHEN dc.calculated_time_spent > 0 THEN (
                        dc.calculated_distance / dc.calculated_time_spent
                    ) * 3.6
                    ELSE 0
                END
            )::numeric,
            2
        ),
        9999999999.99
    ),
    updated_at = NOW()
FROM distance_and_time_calculations dc
WHERE td.user_id = dc.user_id
    AND td.recorded_at = dc.recorded_at;
GET DIAGNOSTICS total_updated = ROW_COUNT;
RETURN total_updated;
END;
$$;
ALTER FUNCTION "public"."update_tracker_distances_small_batch"("target_user_id" "uuid", "max_records" integer) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."update_tracker_distances_small_batch"("target_user_id" "uuid", "max_records" integer) IS 'Lightweight distance calculation function for small batches with very short timeout (30s). Uses LATERAL join to properly access previous records for LAG calculation.';
CREATE OR REPLACE FUNCTION "public"."update_user_profiles_updated_at"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."update_user_profiles_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_want_to_visit_places_updated_at"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."update_want_to_visit_places_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."update_workers_updated_at"() RETURNS "trigger" LANGUAGE "plpgsql"
SET "search_path" TO '' AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."update_workers_updated_at"() OWNER TO "postgres";
CREATE OR REPLACE FUNCTION "public"."validate_tracking_query_limits"(
        "p_limit" integer,
        "p_max_points_threshold" integer
    ) RETURNS boolean LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO '' AS $$ BEGIN -- Enforce maximum limits to prevent DoS
    IF p_limit > 10000 THEN RAISE EXCEPTION 'Limit too high (maximum 10000), requested: %',
    p_limit;
END IF;
IF p_max_points_threshold > 10000 THEN RAISE EXCEPTION 'Max points threshold too high (maximum 10000), requested: %',
p_max_points_threshold;
END IF;
RETURN TRUE;
END;
$$;
ALTER FUNCTION "public"."validate_tracking_query_limits"(
    "p_limit" integer,
    "p_max_points_threshold" integer
) OWNER TO "postgres";
COMMENT ON FUNCTION "public"."validate_tracking_query_limits"(
    "p_limit" integer,
    "p_max_points_threshold" integer
) IS 'Validates query limits to prevent DoS attacks via unbounded queries';
SET default_tablespace = '';
SET default_table_access_method = "heap";
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "description" "text" NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "request_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "audit_logs_severity_check" CHECK (
        (
            "severity" = ANY (
                ARRAY ['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]
            )
        )
    )
);
ALTER TABLE "public"."audit_logs" OWNER TO "postgres";
COMMENT ON TABLE "public"."audit_logs" IS 'Security audit log. Protected by RLS - users can only view their own logs, admins can view all.
Minimum 30-day retention enforced.';
CREATE TABLE IF NOT EXISTS "public"."database_migrations" (
    "version" character varying(20) NOT NULL,
    "name" character varying(255) NOT NULL,
    "checksum" character varying(32) NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"(),
    "execution_time_ms" integer,
    "error_message" "text"
);
ALTER TABLE "public"."database_migrations" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "result" "jsonb",
    "error" "text",
    "last_error" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "worker_id" "text",
    CONSTRAINT "jobs_priority_check" CHECK (
        (
            "priority" = ANY (
                ARRAY ['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]
            )
        )
    ),
    CONSTRAINT "jobs_progress_check" CHECK (
        (
            ("progress" >= 0)
            AND ("progress" <= 100)
        )
    ),
    CONSTRAINT "jobs_status_check" CHECK (
        (
            "status" = ANY (
                ARRAY ['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]
            )
        )
    )
);
ALTER TABLE ONLY "public"."jobs" REPLICA IDENTITY FULL;
ALTER TABLE "public"."jobs" OWNER TO "postgres";
COMMENT ON TABLE "public"."jobs" IS 'Job queue table with realtime updates enabled. REPLICA IDENTITY FULL allows realtime to broadcast complete row data for updates.';
COMMENT ON COLUMN "public"."jobs"."retry_count" IS 'Number of retry attempts for this job';
CREATE TABLE IF NOT EXISTS "public"."poi_visit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "visit_start" timestamp with time zone NOT NULL,
    "visit_end" timestamp with time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "confidence_score" numeric(3, 2),
    "visit_type" "text" DEFAULT 'detected'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "poi_visit_logs_confidence_score_check" CHECK (
        (
            ("confidence_score" >= (0)::numeric)
            AND ("confidence_score" <= (1)::numeric)
        )
    ),
    CONSTRAINT "poi_visit_logs_visit_type_check" CHECK (
        (
            "visit_type" = ANY (
                ARRAY ['detected'::"text", 'manual'::"text", 'confirmed'::"text"]
            )
        )
    )
);
ALTER TABLE "public"."poi_visit_logs" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "full_name" "text",
    "role" "text" DEFAULT 'user'::"text",
    "avatar_url" "text",
    "home_address" "jsonb",
    "two_factor_enabled" boolean DEFAULT false,
    "two_factor_secret" "text",
    "two_factor_recovery_codes" "text" [],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_profiles_role_check" CHECK (
        (
            "role" = ANY (
                ARRAY ['user'::"text", 'admin'::"text", 'moderator'::"text"]
            )
        )
    )
);
ALTER TABLE "public"."user_profiles" OWNER TO "postgres";
COMMENT ON TABLE "public"."user_profiles" IS 'User profile information. Contains sensitive fields like two_factor_secret that should never be exposed via API.
RLS policies ensure users can only access their own profiles.';
COMMENT ON COLUMN "public"."user_profiles"."two_factor_enabled" IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN "public"."user_profiles"."two_factor_secret" IS 'TOTP secret for 2FA authentication';
COMMENT ON COLUMN "public"."user_profiles"."two_factor_recovery_codes" IS 'Array of recovery codes for 2FA backup';
CREATE OR REPLACE VIEW "public"."recent_security_events" AS
SELECT "al"."id",
    "al"."user_id",
    "al"."event_type",
    "al"."severity",
    "al"."description",
    "al"."ip_address",
    "al"."timestamp",
    "up"."full_name" AS "user_name",
    "au"."email" AS "user_email"
FROM (
        (
            "public"."audit_logs" "al"
            LEFT JOIN "public"."user_profiles" "up" ON (("al"."user_id" = "up"."id"))
        )
        LEFT JOIN "auth"."users" "au" ON (("al"."user_id" = "au"."id"))
    )
WHERE (
        (
            "al"."severity" = ANY (ARRAY ['high'::"text", 'critical'::"text"])
        )
        AND (
            "al"."timestamp" >= ("now"() - '24:00:00'::interval)
        )
    )
ORDER BY "al"."timestamp" DESC;
ALTER VIEW "public"."recent_security_events" OWNER TO "postgres";
COMMENT ON VIEW "public"."recent_security_events" IS 'View of recent high-severity security events. Email addresses are included but access is controlled via grants.
Only admins should have access to this view.';
CREATE TABLE IF NOT EXISTS "public"."server_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_name" "text" DEFAULT 'Wayli'::"text",
    "admin_email" "text",
    "allow_registration" boolean DEFAULT true,
    "require_email_verification" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."server_settings" OWNER TO "postgres";
-- Insert default settings if table is empty
INSERT INTO public.server_settings (server_name, admin_email, allow_registration, require_email_verification)
VALUES ('Wayli', 'support@wayli.app', true, false)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE "public"."server_settings" IS 'Server-wide configuration. Read-only for authenticated users, writable only by admins via RLS.';
CREATE TABLE IF NOT EXISTS "public"."tracker_data" (
    "user_id" "uuid" NOT NULL,
    "tracker_type" "text" NOT NULL,
    "device_id" "text",
    "recorded_at" timestamp with time zone NOT NULL,
    "location" "gis"."geometry"(Point, 4326),
    "country_code" character varying(2),
    "altitude" numeric(8, 2),
    "accuracy" numeric(8, 2),
    "speed" numeric(12, 2),
    "distance" numeric(12, 2),
    "time_spent" numeric(12, 2),
    "heading" numeric(5, 2),
    "battery_level" integer,
    "is_charging" boolean,
    "activity_type" "text",
    "geocode" "jsonb",
    "tz_diff" numeric(4, 1),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."tracker_data" OWNER TO "postgres";
COMMENT ON COLUMN "public"."tracker_data"."distance" IS 'Distance in meters from the previous chronological point for this user';
COMMENT ON COLUMN "public"."tracker_data"."time_spent" IS 'Time spent in seconds from the previous chronological point for this user';
COMMENT ON COLUMN "public"."tracker_data"."tz_diff" IS 'Timezone difference from UTC in hours (e.g., +2.0 for UTC+2, -5.0 for UTC-5)';
CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "image_url" "text",
    "labels" "text" [] DEFAULT '{}'::"text" [],
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trips_status_check" CHECK (
        (
            "status" = ANY (
                ARRAY ['active'::"text", 'planned'::"text", 'completed'::"text", 'cancelled'::"text", 'pending'::"text", 'rejected'::"text"]
            )
        )
    )
);
ALTER TABLE "public"."trips" OWNER TO "postgres";
COMMENT ON COLUMN "public"."trips"."status" IS 'Trip status: active, planned, completed, cancelled, pending (suggested), rejected';
COMMENT ON COLUMN "public"."trips"."labels" IS 'Array of labels including "suggested" for trips created from suggestions';
COMMENT ON COLUMN "public"."trips"."metadata" IS 'Trip metadata including dataPoints, visitedCities, visitedCountries, etc.';
CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "id" "uuid" NOT NULL,
    "theme" "text" DEFAULT 'light'::"text",
    "language" "text" DEFAULT 'en'::"text",
    "notifications_enabled" boolean DEFAULT true,
    "timezone" "text" DEFAULT 'UTC+00:00 (London, Dublin)'::"text",
    "pexels_api_key" "text",
    "trip_exclusions" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."user_preferences" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."want_to_visit_places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" NOT NULL,
    "type" "text" NOT NULL,
    "coordinates" "text" NOT NULL,
    "description" "text",
    "address" "text",
    "location" "text",
    "marker_type" "text" DEFAULT 'default'::"text",
    "marker_color" "text" DEFAULT '#3B82F6'::"text",
    "labels" "text" [] DEFAULT '{}'::"text" [],
    "favorite" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);
ALTER TABLE "public"."want_to_visit_places" OWNER TO "postgres";
CREATE TABLE IF NOT EXISTS "public"."workers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "current_job" "uuid",
    "last_heartbeat" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workers_status_check" CHECK (
        (
            "status" = ANY (
                ARRAY ['idle'::"text", 'busy'::"text", 'stopped'::"text"]
            )
        )
    )
);
ALTER TABLE "public"."workers" OWNER TO "postgres";
ALTER TABLE ONLY "public"."audit_logs"
ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."database_migrations"
ADD CONSTRAINT "database_migrations_pkey" PRIMARY KEY ("version");
ALTER TABLE ONLY "public"."jobs"
ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."poi_visit_logs"
ADD CONSTRAINT "poi_visit_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."poi_visit_logs"
ADD CONSTRAINT "poi_visit_logs_user_id_visit_start_key" UNIQUE ("user_id", "visit_start");
ALTER TABLE ONLY "public"."server_settings"
ADD CONSTRAINT "server_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."tracker_data"
ADD CONSTRAINT "tracker_data_pkey" PRIMARY KEY ("user_id", "recorded_at");
ALTER TABLE ONLY "public"."trips"
ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_preferences"
ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_profiles"
ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."want_to_visit_places"
ADD CONSTRAINT "want_to_visit_places_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."workers"
ADD CONSTRAINT "workers_pkey" PRIMARY KEY ("id");
CREATE INDEX "idx_audit_logs_event_type" ON "public"."audit_logs" USING "btree" ("event_type");
CREATE INDEX "idx_audit_logs_ip_address" ON "public"."audit_logs" USING "btree" ("ip_address");
CREATE INDEX "idx_audit_logs_request_id" ON "public"."audit_logs" USING "btree" ("request_id");
CREATE INDEX "idx_audit_logs_severity" ON "public"."audit_logs" USING "btree" ("severity");
CREATE INDEX "idx_audit_logs_severity_timestamp" ON "public"."audit_logs" USING "btree" ("severity", "timestamp" DESC);
CREATE INDEX "idx_audit_logs_timestamp" ON "public"."audit_logs" USING "btree" ("timestamp");
CREATE INDEX "idx_audit_logs_type_timestamp" ON "public"."audit_logs" USING "btree" ("event_type", "timestamp" DESC);
CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING "btree" ("user_id");
CREATE INDEX "idx_audit_logs_user_timestamp" ON "public"."audit_logs" USING "btree" ("user_id", "timestamp" DESC);
CREATE INDEX "idx_jobs_created_at" ON "public"."jobs" USING "btree" ("created_at");
CREATE INDEX "idx_jobs_created_by" ON "public"."jobs" USING "btree" ("created_by");
CREATE INDEX "idx_jobs_priority" ON "public"."jobs" USING "btree" ("priority");
CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("status");
CREATE INDEX "idx_jobs_worker_id" ON "public"."jobs" USING "btree" ("worker_id");
CREATE INDEX "idx_poi_visit_logs_user_id" ON "public"."poi_visit_logs" USING "btree" ("user_id");
CREATE INDEX "idx_poi_visit_logs_visit_end" ON "public"."poi_visit_logs" USING "btree" ("visit_end");
CREATE INDEX "idx_poi_visit_logs_visit_start" ON "public"."poi_visit_logs" USING "btree" ("visit_start");
CREATE INDEX "idx_tracker_data_device_id" ON "public"."tracker_data" USING "btree" ("device_id");
CREATE INDEX "idx_tracker_data_location" ON "public"."tracker_data" USING "gist" ("location");
CREATE INDEX "idx_tracker_data_timestamp" ON "public"."tracker_data" USING "btree" ("recorded_at");
CREATE INDEX "idx_tracker_data_tz_diff" ON "public"."tracker_data" USING "btree" ("tz_diff");
CREATE INDEX "idx_tracker_data_user_id" ON "public"."tracker_data" USING "btree" ("user_id");
CREATE INDEX "idx_tracker_data_user_timestamp_distance" ON "public"."tracker_data" USING "btree" ("user_id", "recorded_at")
WHERE (
        ("distance" IS NULL)
        OR ("distance" = (0)::numeric)
    );
COMMENT ON INDEX "public"."idx_tracker_data_user_timestamp_distance" IS 'Optimizes finding records that need distance calculation';
CREATE INDEX "idx_tracker_data_user_timestamp_location" ON "public"."tracker_data" USING "btree" ("user_id", "recorded_at")
WHERE ("location" IS NOT NULL);
COMMENT ON INDEX "public"."idx_tracker_data_user_timestamp_location" IS 'Optimizes distance calculation queries by user and timestamp with location filter';
CREATE INDEX "idx_tracker_data_user_timestamp_ordered" ON "public"."tracker_data" USING "btree" ("user_id", "recorded_at", "location")
WHERE ("location" IS NOT NULL);
COMMENT ON INDEX "public"."idx_tracker_data_user_timestamp_ordered" IS 'Optimizes LAG window function performance for distance calculations';
CREATE INDEX "idx_trips_end_date" ON "public"."trips" USING "btree" ("end_date");
CREATE INDEX "idx_trips_start_date" ON "public"."trips" USING "btree" ("start_date");
CREATE INDEX "idx_trips_user_id" ON "public"."trips" USING "btree" ("user_id");
CREATE INDEX "idx_user_preferences_id" ON "public"."user_preferences" USING "btree" ("id");
CREATE INDEX "idx_user_profiles_id" ON "public"."user_profiles" USING "btree" ("id");
CREATE INDEX "idx_want_to_visit_places_created_at" ON "public"."want_to_visit_places" USING "btree" ("created_at");
CREATE INDEX "idx_want_to_visit_places_favorite" ON "public"."want_to_visit_places" USING "btree" ("favorite");
CREATE INDEX "idx_want_to_visit_places_type" ON "public"."want_to_visit_places" USING "btree" ("type");
CREATE INDEX "idx_want_to_visit_places_user_id" ON "public"."want_to_visit_places" USING "btree" ("user_id");
CREATE INDEX "idx_workers_last_heartbeat" ON "public"."workers" USING "btree" ("last_heartbeat");
CREATE INDEX "idx_workers_status" ON "public"."workers" USING "btree" ("status");
CREATE INDEX "idx_workers_updated_at" ON "public"."workers" USING "btree" ("updated_at");
CREATE OR REPLACE TRIGGER "audit_user_role_change_trigger"
AFTER
UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_user_role_change"();
CREATE OR REPLACE TRIGGER "tracker_data_distance_trigger" BEFORE
INSERT
    OR
UPDATE ON "public"."tracker_data" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_calculate_distance"();
CREATE OR REPLACE TRIGGER "trigger_update_want_to_visit_places_updated_at" BEFORE
UPDATE ON "public"."want_to_visit_places" FOR EACH ROW EXECUTE FUNCTION "public"."update_want_to_visit_places_updated_at"();
CREATE OR REPLACE TRIGGER "update_audit_logs_updated_at" BEFORE
UPDATE ON "public"."audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_audit_logs_updated_at"();
CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE
UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_profiles_updated_at"();
CREATE OR REPLACE TRIGGER "update_workers_updated_at" BEFORE
UPDATE ON "public"."workers" FOR EACH ROW EXECUTE FUNCTION "public"."update_workers_updated_at"();
ALTER TABLE ONLY "public"."audit_logs"
ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE
SET NULL;
ALTER TABLE ONLY "public"."jobs"
ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."poi_visit_logs"
ADD CONSTRAINT "poi_visit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."tracker_data"
ADD CONSTRAINT "tracker_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."trips"
ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_preferences"
ADD CONSTRAINT "user_preferences_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_profiles"
ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."want_to_visit_places"
ADD CONSTRAINT "want_to_visit_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."workers"
ADD CONSTRAINT "workers_current_job_fkey" FOREIGN KEY ("current_job") REFERENCES "public"."jobs"("id") ON DELETE
SET NULL;
ALTER TABLE ONLY "public"."workers"
ADD CONSTRAINT "workers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
CREATE POLICY "Public can view server settings" ON "public"."server_settings"
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage server settings" ON "public"."server_settings"
FOR ALL
USING (
    (
        (
            (
                SELECT "auth"."role"() AS "role"
            ) = 'service_role'::"text"
        )
        OR (
            EXISTS (
                SELECT 1
                FROM "public"."user_profiles"
                WHERE (
                        (
                            "user_profiles"."id" = (
                                SELECT "auth"."uid"() AS "uid"
                            )
                        )
                        AND ("user_profiles"."role" = 'admin'::"text")
                    )
            )
        )
    )
);
CREATE POLICY "Jobs can be updated" ON "public"."jobs" FOR
UPDATE USING (
        (
            ("auth"."uid"() = "created_by")
            OR ("auth"."role"() = 'service_role'::"text")
            OR (
                EXISTS (
                    SELECT 1
                    FROM "public"."workers"
                    WHERE (
                            ("workers"."id" = "auth"."uid"())
                            AND ("workers"."current_job" = "jobs"."id")
                        )
                )
            )
        )
    );
COMMENT ON POLICY "Jobs can be updated" ON "public"."jobs" IS 'Allows job updates by: job creator, service role, or worker assigned to this specific job';
CREATE POLICY "Service role can delete audit logs" ON "public"."audit_logs" FOR DELETE USING (
    (
        (
            SELECT "auth"."role"() AS "role"
        ) = 'service_role'::"text"
    )
);
CREATE POLICY "Service role can insert audit logs" ON "public"."audit_logs" FOR
INSERT WITH CHECK (
        (
            (
                SELECT "auth"."role"() AS "role"
            ) = 'service_role'::"text"
        )
    );
CREATE POLICY "Service role can manage migrations" ON "public"."database_migrations" USING (
    (
        (
            SELECT "auth"."role"() AS "role"
        ) = 'service_role'::"text"
    )
);
CREATE POLICY "Service role can update audit logs" ON "public"."audit_logs" FOR
UPDATE USING (
        (
            (
                SELECT "auth"."role"() AS "role"
            ) = 'service_role'::"text"
        )
    );
CREATE POLICY "User preferences can be deleted" ON "public"."user_preferences" FOR DELETE USING (
    (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "id"
        )
        OR (
            (
                SELECT "auth"."role"() AS "role"
            ) = 'service_role'::"text"
        )
    )
);
CREATE POLICY "User preferences can be inserted" ON "public"."user_preferences" FOR
INSERT WITH CHECK (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "User preferences can be updated" ON "public"."user_preferences" FOR
UPDATE USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "User preferences can be viewed" ON "public"."user_preferences" FOR
SELECT USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "User profiles can be deleted" ON "public"."user_profiles" FOR DELETE USING (
    (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "id"
        )
        OR (
            (
                SELECT "auth"."role"() AS "role"
            ) = 'service_role'::"text"
        )
    )
);
CREATE POLICY "User profiles can be inserted" ON "public"."user_profiles" FOR
INSERT WITH CHECK (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "User profiles can be updated" ON "public"."user_profiles" FOR
UPDATE USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "User profiles can be viewed" ON "public"."user_profiles" FOR
SELECT USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "Users can delete their own POI visit logs" ON "public"."poi_visit_logs" FOR DELETE USING (
    (
        (
            SELECT "auth"."uid"() AS "uid"
        ) = "user_id"
    )
);
CREATE POLICY "Users can delete their own jobs" ON "public"."jobs" FOR DELETE USING (
    (
        (
            SELECT "auth"."uid"() AS "uid"
        ) = "created_by"
    )
);
CREATE POLICY "Users can delete their own tracker data" ON "public"."tracker_data" FOR DELETE USING (
    (
        (
            SELECT "auth"."uid"() AS "uid"
        ) = "user_id"
    )
);
CREATE POLICY "Users can delete their own trips" ON "public"."trips" FOR DELETE USING (
    (
        (
            SELECT "auth"."uid"() AS "uid"
        ) = "user_id"
    )
);
CREATE POLICY "Users can delete their own want to visit places" ON "public"."want_to_visit_places" FOR DELETE USING (
    (
        (
            SELECT "auth"."uid"() AS "uid"
        ) = "user_id"
    )
);
CREATE POLICY "Users can insert their own POI visit logs" ON "public"."poi_visit_logs" FOR
INSERT WITH CHECK (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can insert their own jobs" ON "public"."jobs" FOR
INSERT WITH CHECK (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "created_by"
        )
    );
CREATE POLICY "Users can insert their own tracker data" ON "public"."tracker_data" FOR
INSERT WITH CHECK (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can insert their own trips" ON "public"."trips" FOR
INSERT WITH CHECK (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can insert their own want to visit places" ON "public"."want_to_visit_places" FOR
INSERT WITH CHECK (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can update their own POI visit logs" ON "public"."poi_visit_logs" FOR
UPDATE USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can update their own tracker data" ON "public"."tracker_data" FOR
UPDATE USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can update their own trips" ON "public"."trips" FOR
UPDATE USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can update their own want to visit places" ON "public"."want_to_visit_places" FOR
UPDATE USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can view audit logs" ON "public"."audit_logs" FOR
SELECT USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "user_id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
            OR (
                EXISTS (
                    SELECT 1
                    FROM "public"."user_profiles"
                    WHERE (
                            (
                                "user_profiles"."id" = (
                                    SELECT "auth"."uid"() AS "uid"
                                )
                            )
                            AND ("user_profiles"."role" = 'admin'::"text")
                        )
                )
            )
        )
    );
CREATE POLICY "Users can view their own POI visit logs" ON "public"."poi_visit_logs" FOR
SELECT USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can view their own jobs" ON "public"."jobs" FOR
SELECT USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "created_by"
        )
    );
COMMENT ON POLICY "Users can view their own jobs" ON "public"."jobs" IS 'Allows users to view their own jobs. This policy is compatible with Supabase Realtime - users will receive real-time updates for jobs they created.';
CREATE POLICY "Users can view their own tracker data" ON "public"."tracker_data" FOR
SELECT USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can view their own trips" ON "public"."trips" FOR
SELECT USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Users can view their own want to visit places" ON "public"."want_to_visit_places" FOR
SELECT USING (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
    );
CREATE POLICY "Workers can be deleted" ON "public"."workers" FOR DELETE USING (
    (
        (
            (
                SELECT "auth"."uid"() AS "uid"
            ) = "user_id"
        )
        OR (
            (
                SELECT "auth"."role"() AS "role"
            ) = 'service_role'::"text"
        )
    )
);
CREATE POLICY "Workers can be inserted" ON "public"."workers" FOR
INSERT WITH CHECK (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "user_id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "Workers can be updated" ON "public"."workers" FOR
UPDATE USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "user_id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
CREATE POLICY "Workers can be viewed" ON "public"."workers" FOR
SELECT USING (
        (
            (
                (
                    SELECT "auth"."uid"() AS "uid"
                ) = "user_id"
            )
            OR (
                (
                    SELECT "auth"."role"() AS "role"
                ) = 'service_role'::"text"
            )
        )
    );
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."database_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."poi_visit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."server_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tracker_data" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."want_to_visit_places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workers" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";
ALTER PUBLICATION "supabase_realtime"
ADD TABLE ONLY "public"."jobs";
GRANT USAGE ON SCHEMA "gis" TO PUBLIC;
GRANT USAGE ON SCHEMA "gis" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT ALL ON FUNCTION "public"."audit_user_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_user_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_user_role_change"() TO "service_role";
GRANT ALL ON FUNCTION "public"."calculate_distances_batch_v2"(
        "p_user_id" "uuid",
        "p_offset" integer,
        "p_limit" integer
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_distances_batch_v2"(
        "p_user_id" "uuid",
        "p_offset" integer,
        "p_limit" integer
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_distances_batch_v2"(
        "p_user_id" "uuid",
        "p_offset" integer,
        "p_limit" integer
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."calculate_mode_aware_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "transport_mode" "text"
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_mode_aware_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "transport_mode" "text"
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_mode_aware_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "transport_mode" "text"
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."calculate_stable_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "window_size" integer
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_stable_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "window_size" integer
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_stable_speed"(
        "user_id_param" "uuid",
        "recorded_at_param" timestamp with time zone,
        "window_size" integer
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_expired_exports"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_exports"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_exports"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"("retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"("retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_logs"("retention_days" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."create_distance_calculation_job"("target_user_id" "uuid", "job_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_distance_calculation_job"("target_user_id" "uuid", "job_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_distance_calculation_job"("target_user_id" "uuid", "job_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."disable_tracker_data_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."disable_tracker_data_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_tracker_data_trigger"() TO "service_role";
GRANT ALL ON FUNCTION "public"."enable_tracker_data_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."enable_tracker_data_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enable_tracker_data_trigger"() TO "service_role";
GRANT ALL ON FUNCTION "public"."full_country"("country" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."full_country"("country" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."full_country"("country" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_audit_statistics"(
        "start_date" timestamp with time zone,
        "end_date" timestamp with time zone
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."get_audit_statistics"(
        "start_date" timestamp with time zone,
        "end_date" timestamp with time zone
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_audit_statistics"(
        "start_date" timestamp with time zone,
        "end_date" timestamp with time zone
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_points_within_radius"(
        "center_lat" double precision,
        "center_lon" double precision,
        "radius_meters" double precision,
        "user_uuid" "uuid"
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."get_points_within_radius"(
        "center_lat" double precision,
        "center_lon" double precision,
        "radius_meters" double precision,
        "user_uuid" "uuid"
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_points_within_radius"(
        "center_lat" double precision,
        "center_lon" double precision,
        "radius_meters" double precision,
        "user_uuid" "uuid"
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_server_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_server_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_server_settings"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_activity_summary"("p_user_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_activity_summary"("p_user_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_activity_summary"("p_user_id" "uuid", "p_days" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_tracking_data"(
        "user_uuid" "uuid",
        "start_date" timestamp with time zone,
        "end_date" timestamp with time zone,
        "limit_count" integer
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tracking_data"(
        "user_uuid" "uuid",
        "start_date" timestamp with time zone,
        "end_date" timestamp with time zone,
        "limit_count" integer
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tracking_data"(
        "user_uuid" "uuid",
        "start_date" timestamp with time zone,
        "end_date" timestamp with time zone,
        "limit_count" integer
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_uuid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."log_audit_event"(
        "p_event_type" "text",
        "p_description" "text",
        "p_severity" "text",
        "p_metadata" "jsonb"
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit_event"(
        "p_event_type" "text",
        "p_description" "text",
        "p_severity" "text",
        "p_metadata" "jsonb"
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit_event"(
        "p_event_type" "text",
        "p_description" "text",
        "p_severity" "text",
        "p_metadata" "jsonb"
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."perform_bulk_import_with_distance_calculation"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."perform_bulk_import_with_distance_calculation"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."perform_bulk_import_with_distance_calculation"("target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."remove_duplicate_tracking_points"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_duplicate_tracking_points"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_duplicate_tracking_points"("target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."sample_tracker_data_if_needed"(
        "p_target_user_id" "uuid",
        "p_start_date" timestamp with time zone,
        "p_end_date" timestamp with time zone,
        "p_max_points_threshold" integer,
        "p_min_distance_meters" numeric,
        "p_min_time_minutes" numeric,
        "p_max_points_per_hour" integer,
        "p_offset" integer,
        "p_limit" integer
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."sample_tracker_data_if_needed"(
        "p_target_user_id" "uuid",
        "p_start_date" timestamp with time zone,
        "p_end_date" timestamp with time zone,
        "p_max_points_threshold" integer,
        "p_min_distance_meters" numeric,
        "p_min_time_minutes" numeric,
        "p_max_points_per_hour" integer,
        "p_offset" integer,
        "p_limit" integer
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sample_tracker_data_if_needed"(
        "p_target_user_id" "uuid",
        "p_start_date" timestamp with time zone,
        "p_end_date" timestamp with time zone,
        "p_max_points_threshold" integer,
        "p_min_distance_meters" numeric,
        "p_min_time_minutes" numeric,
        "p_max_points_per_hour" integer,
        "p_offset" integer,
        "p_limit" integer
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."st_distancesphere"(
        "geog1" "gis"."geography",
        "geog2" "gis"."geography"
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"(
        "geog1" "gis"."geography",
        "geog2" "gis"."geography"
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"(
        "geog1" "gis"."geography",
        "geog2" "gis"."geography"
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."st_distancesphere"(
        "geom1" "gis"."geometry",
        "geom2" "gis"."geometry"
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"(
        "geom1" "gis"."geometry",
        "geom2" "gis"."geometry"
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"(
        "geom1" "gis"."geometry",
        "geom2" "gis"."geometry"
    ) TO "service_role";
GRANT ALL ON FUNCTION "public"."trigger_calculate_distance"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_calculate_distance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_calculate_distance"() TO "service_role";
GRANT ALL ON FUNCTION "public"."trigger_calculate_distance_enhanced"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_calculate_distance_enhanced"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_calculate_distance_enhanced"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_audit_logs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_audit_logs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_audit_logs_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_tracker_distances"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tracker_distances"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tracker_distances"("target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_batch"("target_user_id" "uuid", "batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_batch"("target_user_id" "uuid", "batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_batch"("target_user_id" "uuid", "batch_size" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_enhanced"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_enhanced"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_enhanced"("target_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_small_batch"("target_user_id" "uuid", "max_records" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_small_batch"("target_user_id" "uuid", "max_records" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tracker_distances_small_batch"("target_user_id" "uuid", "max_records" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_want_to_visit_places_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_want_to_visit_places_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_want_to_visit_places_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_workers_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_workers_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workers_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."validate_tracking_query_limits"(
        "p_limit" integer,
        "p_max_points_threshold" integer
    ) TO "anon";
GRANT ALL ON FUNCTION "public"."validate_tracking_query_limits"(
        "p_limit" integer,
        "p_max_points_threshold" integer
    ) TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_tracking_query_limits"(
        "p_limit" integer,
        "p_max_points_threshold" integer
    ) TO "service_role";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."database_migrations" TO "service_role";
GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";
GRANT ALL ON TABLE "public"."poi_visit_logs" TO "anon";
GRANT ALL ON TABLE "public"."poi_visit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."poi_visit_logs" TO "service_role";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
GRANT SELECT,
    UPDATE ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_security_events" TO "anon";
GRANT ALL ON TABLE "public"."recent_security_events" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_security_events" TO "service_role";
GRANT ALL ON TABLE "public"."server_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."server_settings" TO "anon";
GRANT SELECT ON TABLE "public"."server_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_data" TO "anon";
GRANT ALL ON TABLE "public"."tracker_data" TO "authenticated";
GRANT ALL ON TABLE "public"."tracker_data" TO "service_role";
GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";
GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";
GRANT ALL ON TABLE "public"."want_to_visit_places" TO "anon";
GRANT ALL ON TABLE "public"."want_to_visit_places" TO "authenticated";
GRANT ALL ON TABLE "public"."want_to_visit_places" TO "service_role";
GRANT ALL ON TABLE "public"."workers" TO "anon";
GRANT ALL ON TABLE "public"."workers" TO "authenticated";
GRANT ALL ON TABLE "public"."workers" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
GRANT ALL ON TABLES TO "service_role";
RESET ALL;
--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created"
AFTER
INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();
-- Create temp-files bucket for temporary import files
INSERT INTO storage.buckets (id, name, file_size_limit)
VALUES (
    'temp-files',
    'temp-files',
    2147483648  -- 2GiB in bytes
) ON CONFLICT (id) DO NOTHING;

-- Create trip-images bucket for trip images
INSERT INTO storage.buckets (id, name, file_size_limit)
VALUES (
    'trip-images',
    'trip-images',
    104857600  -- 100MiB in bytes
) ON CONFLICT (id) DO NOTHING;

-- Create exports bucket for user data exports
INSERT INTO storage.buckets (id, name, file_size_limit)
VALUES (
    'exports',
    'exports',
    2147483648  -- 2GiB in bytes
) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public can view trip images" ON "storage"."objects" FOR
SELECT USING (("bucket_id" = 'trip-images'::"text"));
CREATE POLICY "Users access own exports" ON "storage"."objects" FOR
SELECT USING (
        (
            ("bucket_id" = 'exports'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users access own temp files" ON "storage"."objects" FOR
SELECT USING (
        (
            ("bucket_id" = 'temp-files'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users delete own exports" ON "storage"."objects" FOR DELETE USING (
    (
        ("bucket_id" = 'exports'::"text")
        AND (
            ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
        )
    )
);
CREATE POLICY "Users delete own temp files" ON "storage"."objects" FOR DELETE USING (
    (
        ("bucket_id" = 'temp-files'::"text")
        AND (
            ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
        )
    )
);
CREATE POLICY "Users delete own trip images" ON "storage"."objects" FOR DELETE USING (
    (
        ("bucket_id" = 'trip-images'::"text")
        AND (
            ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
        )
    )
);
CREATE POLICY "Users upload own exports" ON "storage"."objects" FOR
INSERT WITH CHECK (
        (
            ("bucket_id" = 'exports'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users upload own temp files" ON "storage"."objects" FOR
INSERT WITH CHECK (
        (
            ("bucket_id" = 'temp-files'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users upload own trip images" ON "storage"."objects" FOR
INSERT WITH CHECK (
        (
            ("bucket_id" = 'trip-images'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users update own temp files" ON "storage"."objects" FOR
UPDATE USING (
        (
            ("bucket_id" = 'temp-files'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users update own trip images" ON "storage"."objects" FOR
UPDATE USING (
        (
            ("bucket_id" = 'trip-images'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
CREATE POLICY "Users update own exports" ON "storage"."objects" FOR
UPDATE USING (
        (
            ("bucket_id" = 'exports'::"text")
            AND (
                ("auth"."uid"())::"text" = ("storage"."foldername"("name")) [1]
            )
        )
    );
