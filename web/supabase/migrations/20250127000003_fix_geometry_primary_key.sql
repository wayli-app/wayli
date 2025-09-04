-- Fix the geometry equality operator issue by updating the primary key
-- This migration fixes the "operator is not unique: gis.geometry = gis.geometry" error

-- Check if the table exists and has the problematic primary key
DO $$
BEGIN
    -- Check if tracker_data table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tracker_data' AND table_schema = 'public') THEN

        -- Check if the current primary key includes the location field
        IF EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'tracker_data'
                AND tc.table_schema = 'public'
                AND tc.constraint_type = 'PRIMARY KEY'
                AND kcu.column_name = 'location'
        ) THEN
            RAISE NOTICE 'Found primary key with geometry field, fixing...';

            -- Drop the existing primary key constraint
            ALTER TABLE public.tracker_data DROP CONSTRAINT IF EXISTS tracker_data_pkey;

            -- Add a new primary key without the geometry field
            ALTER TABLE public.tracker_data ADD CONSTRAINT tracker_data_pkey PRIMARY KEY (user_id, recorded_at);

            RAISE NOTICE 'Fixed tracker_data primary key - removed geometry field';
        ELSE
            RAISE NOTICE 'Primary key does not include geometry field, no fix needed';
        END IF;
    ELSE
        RAISE NOTICE 'tracker_data table does not exist';
    END IF;
END $$;
