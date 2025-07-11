# Database Migration Required

The trip update feature is currently working without image upload due to storage configuration issues. However, to enable full functionality including metadata support, you need to run the database migration.

## Required Migration

Run the following SQL in your Supabase SQL Editor:

```sql
-- Migration script to update trips table schema

-- Step 1: Add the labels column
ALTER TABLE trips
ADD COLUMN labels TEXT[] DEFAULT '{}';

-- Step 2: Add the metadata column
ALTER TABLE trips
ADD COLUMN metadata JSONB;

-- Step 3: Migrate existing data from generated_from_tracker_data to labels
-- For trips that were auto-generated, add 'auto-generated' label
UPDATE trips
SET labels = ARRAY['auto-generated']
WHERE generated_from_tracker_data = true;

-- For trips that were manually created, add 'manual' label
UPDATE trips
SET labels = ARRAY['manual']
WHERE generated_from_tracker_data = false OR generated_from_tracker_data IS NULL;

-- Step 4: Migrate generation_metadata to metadata (if it exists)
UPDATE trips
SET metadata = generation_metadata
WHERE generation_metadata IS NOT NULL;

-- Step 5: Add default metadata for trips without it
UPDATE trips
SET metadata = jsonb_build_object(
    'distance_traveled', 0,
    'visited_places_count', 1
)
WHERE metadata IS NULL;
```

## Storage Setup

For image upload functionality, you also need to set up the storage bucket. See `STORAGE_SETUP.md` for detailed instructions.

## Current Status

- ✅ Trip creation and editing works
- ✅ Labels functionality works
- ⚠️ Image upload disabled (storage not configured)
- ⚠️ Metadata disabled (migration not run)

After running the migration, the app will automatically enable metadata support.