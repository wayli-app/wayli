-- Run this script to apply the tracker_data composite key migration
-- This will modify the table to use (user_id, location, recorded_at) as the primary key

BEGIN;

-- First, drop the existing primary key constraint
ALTER TABLE public.tracker_data DROP CONSTRAINT IF EXISTS tracker_data_pkey;

-- Drop the id column since we're using a composite key
ALTER TABLE public.tracker_data DROP COLUMN IF EXISTS id;

-- Add composite primary key
ALTER TABLE public.tracker_data
ADD CONSTRAINT tracker_data_pkey
PRIMARY KEY (user_id, location, recorded_at);

-- Add a unique index on the composite key for better performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracker_data_composite_key
ON public.tracker_data (user_id, location, recorded_at);

-- Update existing indexes to work with the new structure
-- Drop the old user_id index since it's now part of the primary key
DROP INDEX IF EXISTS idx_tracker_data_user_id;

-- Add a comment to document the change
COMMENT ON TABLE public.tracker_data IS 'Tracker data with composite primary key (user_id, location, recorded_at) for upsert operations';

COMMIT;

-- Verify the changes
SELECT
    table_name,
    constraint_name,
    constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'tracker_data'
AND constraint_type = 'PRIMARY KEY';

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'tracker_data';