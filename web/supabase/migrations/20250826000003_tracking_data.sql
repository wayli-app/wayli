-- Tracking Data Migration
-- This migration creates the tracker_data table and related spatial functions

-- Create tracker_data table for OwnTracks and other tracking apps
CREATE TABLE IF NOT EXISTS public.tracker_data (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tracker_type TEXT NOT NULL, -- 'owntracks', 'gpx', 'fitbit', etc.
    device_id TEXT, -- Device identifier from tracking app
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location GEOMETRY(POINT, 4326), -- PostGIS point with WGS84 SRID
    country_code VARCHAR(2), -- ISO 3166-1 alpha-2 country code
    altitude DECIMAL(8, 2), -- Altitude in meters
    accuracy DECIMAL(8, 2), -- GPS accuracy in meters
    speed DECIMAL(12, 2), -- Speed in m/s (increased precision to avoid overflow)
    distance DECIMAL(12, 2), -- Distance compared to previous point (increased precision)
    time_spent DECIMAL(12, 2), -- Time difference in seconds compared to previous point (increased precision)
    heading DECIMAL(5, 2), -- Heading in degrees (0-360)
    battery_level INTEGER, -- Battery level percentage
    is_charging BOOLEAN,
    activity_type TEXT, -- 'walking', 'driving', 'cycling', etc.
    geocode JSONB, -- Store geocoded data from Nominatim
    tz_diff DECIMAL(4, 1), -- Timezone difference from UTC in hours (e.g., +2.0, -5.0)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, location, recorded_at)
);

-- Create poi_visit_logs table for detailed visit records
CREATE TABLE IF NOT EXISTS public.poi_visit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_start TIMESTAMP WITH TIME ZONE NOT NULL,
    visit_end TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    confidence_score DECIMAL(3,2),
    visit_type TEXT DEFAULT 'detected',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, visit_start) -- Prevent duplicate visits for same POI at same time
);

-- Add constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'poi_visit_logs_confidence_score_check'
        AND conrelid = 'public.poi_visit_logs'::regclass
    ) THEN
        ALTER TABLE public.poi_visit_logs
        ADD CONSTRAINT poi_visit_logs_confidence_score_check
        CHECK (confidence_score >= 0 AND confidence_score <= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'poi_visit_logs_visit_type_check'
        AND conrelid = 'public.poi_visit_logs'::regclass
    ) THEN
        ALTER TABLE public.poi_visit_logs
        ADD CONSTRAINT poi_visit_logs_visit_type_check
        CHECK (visit_type IN ('detected', 'manual', 'confirmed'));
    END IF;
END $$;

-- Create basic indexes for tracking data
CREATE INDEX IF NOT EXISTS idx_tracker_data_user_id ON public.tracker_data(user_id);
CREATE INDEX IF NOT EXISTS idx_tracker_data_timestamp ON public.tracker_data(recorded_at);
CREATE INDEX IF NOT EXISTS idx_tracker_data_device_id ON public.tracker_data(device_id);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_user_id ON public.poi_visit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_visit_start ON public.poi_visit_logs(visit_start);
CREATE INDEX IF NOT EXISTS idx_poi_visit_logs_visit_end ON public.poi_visit_logs(visit_end);

-- Create spatial indexes for PostGIS
CREATE INDEX IF NOT EXISTS idx_tracker_data_location ON public.tracker_data USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_tracker_data_tz_diff ON public.tracker_data(tz_diff);

-- Function to get points within a radius
CREATE OR REPLACE FUNCTION get_points_within_radius(
    center_lat DOUBLE PRECISION,
    center_lon DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    user_uuid UUID
)
RETURNS TABLE (
    user_id UUID,
    recorded_at TIMESTAMP WITH TIME ZONE,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.user_id,
        td.recorded_at,
        ST_Y(td.location::geometry) as lat,
        ST_X(td.location::geometry) as lon,
        ST_DistanceSphere(td.location, ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)) as distance_meters
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
      AND ST_DWithin(
          td.location::geography,
          ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326)::geography,
          radius_meters
      )
    ORDER BY td.recorded_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user tracking data with optional filters
CREATE OR REPLACE FUNCTION get_user_tracking_data(
    user_uuid UUID,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    limit_count INTEGER DEFAULT 1000
)
RETURNS TABLE (
    user_id UUID,
    recorded_at TIMESTAMP WITH TIME ZONE,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    altitude DECIMAL(8, 2),
    accuracy DECIMAL(8, 2),
    speed DECIMAL(8, 2),
    activity_type TEXT,
    geocode JSONB,
    distance DECIMAL,
    time_spent DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.user_id,
        td.recorded_at,
        ST_Y(td.location::geometry) as lat,
        ST_X(td.location::geometry) as lon,
        td.altitude,
        td.accuracy,
        td.speed,
        td.activity_type,
        td.geocode,
        td.distance,
        td.time_spent
    FROM public.tracker_data td
    WHERE td.user_id = user_uuid
      AND (start_date IS NULL OR td.recorded_at >= start_date)
      AND (end_date IS NULL OR td.recorded_at <= end_date)
    ORDER BY td.recorded_at ASC -- Changed to ASC for proper distance calculation
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: sample_tracker_data_if_needed
-- Intelligently samples tracker data when point count exceeds threshold
CREATE OR REPLACE FUNCTION sample_tracker_data_if_needed(
    p_target_user_id UUID,
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_max_points_threshold INTEGER DEFAULT 1000,
    p_min_distance_meters DECIMAL DEFAULT 500,
    p_min_time_minutes DECIMAL DEFAULT 5,
    p_max_points_per_hour INTEGER DEFAULT 30,
    p_offset INTEGER DEFAULT 0,
    p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
    result_user_id UUID,
    result_tracker_type TEXT,
    result_device_id TEXT,
    result_recorded_at TIMESTAMP WITH TIME ZONE,
    result_location GEOMETRY(POINT, 4326),
    result_country_code VARCHAR(2),
    result_altitude DECIMAL(8, 2),
    result_accuracy DECIMAL(8, 2),
    result_speed DECIMAL(12, 2),
    result_distance DECIMAL(8, 2),
    result_time_spent DECIMAL(8, 2),
    result_heading DECIMAL(5, 2),
    result_battery_level INTEGER,
    result_is_charging BOOLEAN,
    result_activity_type TEXT,
    result_geocode JSONB,
    result_tz_diff DECIMAL(4, 1),
    result_created_at TIMESTAMP WITH TIME ZONE,
    result_updated_at TIMESTAMP WITH TIME ZONE,
    result_is_sampled BOOLEAN,
    result_total_count BIGINT
) AS $$
DECLARE
    total_point_count BIGINT;
    min_distance_degrees DECIMAL;
    min_time_interval INTERVAL;
BEGIN
    -- Convert meters to degrees (approximate: 1 degree ≈ 111,000 meters)
    min_distance_degrees := p_min_distance_meters / 111000.0;

    -- Convert minutes to interval
    min_time_interval := (p_min_time_minutes || ' minutes')::INTERVAL;

    -- First, count total points in the date range
    SELECT COUNT(*)
    INTO total_point_count
    FROM public.tracker_data
    WHERE user_id = p_target_user_id
    AND location IS NOT NULL
    AND (p_start_date IS NULL OR recorded_at >= p_start_date)
    AND (p_end_date IS NULL OR recorded_at <= p_end_date);

    -- If point count is below threshold OR no sampling parameters are set, return all points
    IF total_point_count <= p_max_points_threshold OR (p_min_distance_meters = 0 AND p_min_time_minutes = 0) THEN
        RETURN QUERY
        SELECT
            td.user_id as result_user_id,
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
        AND (p_start_date IS NULL OR td.recorded_at >= p_start_date)
        AND (p_end_date IS NULL OR td.recorded_at <= p_end_date)
        ORDER BY td.recorded_at
        LIMIT p_limit OFFSET p_offset;
    ELSE
        -- Apply intelligent sampling
        RETURN QUERY
        WITH ranked_points AS (
            SELECT
                td.user_id as result_user_id,
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
                    WHEN LAG(td.location) OVER (ORDER BY td.recorded_at) IS NULL THEN 0
                    ELSE ST_DistanceSphere(
                        LAG(td.location) OVER (ORDER BY td.recorded_at),
                        td.location
                    )
                END as distance_from_prev,
                -- Calculate time from previous point
                CASE
                    WHEN LAG(td.recorded_at) OVER (ORDER BY td.recorded_at) IS NULL THEN INTERVAL '0 seconds'
                    ELSE td.recorded_at - LAG(td.recorded_at) OVER (ORDER BY td.recorded_at)
                END as time_from_prev,
                -- Calculate points per hour in sliding window
                COUNT(*) OVER (
                    ORDER BY td.recorded_at
                    RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
                ) as points_in_hour,
                -- Row number for sampling
                ROW_NUMBER() OVER (ORDER BY td.recorded_at) as row_num
            FROM public.tracker_data td
            WHERE td.user_id = p_target_user_id
            AND td.location IS NOT NULL
            AND (p_start_date IS NULL OR td.recorded_at >= p_start_date)
            AND (p_end_date IS NULL OR td.recorded_at <= p_end_date)
        ),
        sampled_points AS (
            SELECT
                rp.result_user_id,
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
                    WHEN rp.row_num = 1 OR rp.row_num = total_point_count THEN true
                    -- Keep points with significant movement
                    WHEN rp.distance_from_prev >= p_min_distance_meters THEN true
                    -- Keep points with significant time gap
                    WHEN rp.time_from_prev >= min_time_interval THEN true
                    -- Keep points if we're under the hourly limit
                    WHEN rp.points_in_hour <= p_max_points_per_hour THEN true
                    -- Sample remaining points (keep every nth point)
                    WHEN rp.row_num % CEIL(total_point_count::DECIMAL / p_max_points_threshold) = 0 THEN true
                    ELSE false
                END as should_keep
            FROM ranked_points rp
        )
        SELECT
            sp.result_user_id,
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
$$ LANGUAGE plpgsql;

-- Add comment for the function
COMMENT ON FUNCTION sample_tracker_data_if_needed IS 'Intelligently samples tracker data when point count exceeds threshold. Uses dynamic spatial-temporal sampling with configurable parameters that become more aggressive for larger datasets.';

-- Function to get full country name for ISO codes
CREATE OR REPLACE FUNCTION full_country(country text) RETURNS text AS $$
SELECT value
FROM json_each_text('{
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
}') AS json_data(key, value)
WHERE key = UPPER(country);
$$ LANGUAGE sql IMMUTABLE;

-- Add comment for documentation
COMMENT ON FUNCTION full_country(text) IS 'Maps ISO 3166-1 alpha-2 country codes to full country names';
