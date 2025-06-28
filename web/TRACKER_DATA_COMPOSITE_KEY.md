# Tracker Data Composite Key Migration

## Overview

The `tracker_data` table has been modified to use a composite primary key consisting of `(user_id, location, recorded_at)` instead of a UUID primary key. This change enables upsert operations to prevent duplicate tracking data entries.

## Changes Made

### 1. Database Schema Changes

**Before:**
```sql
CREATE TABLE tracker_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    -- other fields...
);
```

**After:**
```sql
CREATE TABLE tracker_data (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    -- other fields...
    PRIMARY KEY (user_id, location, recorded_at)
);
```

### 2. Code Changes

- **OwnTracks Endpoint**: Updated to use `upsert()` instead of `insert()` with conflict resolution on the composite key
- **TypeScript Types**: Updated `TrackerData` interface to remove the `id` field
- **Database Types**: Added comment documenting the composite key structure

## Migration Steps

### For Existing Databases

1. **Run the migration script:**
   ```bash
   psql -d your_database -f web/run-tracker-migration.sql
   ```

2. **Verify the changes:**
   ```sql
   -- Check primary key structure
   SELECT
       table_name,
       constraint_name,
       constraint_type
   FROM information_schema.table_constraints
   WHERE table_name = 'tracker_data'
   AND constraint_type = 'PRIMARY KEY';
   ```

### For New Deployments

The `setup-database.sql` file should be updated to reflect the new structure. The current version still uses the old UUID primary key structure.

## Benefits

1. **Prevents Duplicates**: Same user at same location and time will be updated instead of creating duplicates
2. **Better Performance**: Composite key provides efficient lookups for user-specific queries
3. **Upsert Support**: Enables atomic insert-or-update operations
4. **Data Integrity**: Ensures unique tracking points per user

## API Changes

The OwnTracks endpoint now uses upsert:

```typescript
const { error } = await supabaseAdmin
    .from('tracker_data')
    .upsert(trackingData, {
        onConflict: 'user_id,location,recorded_at',
        ignoreDuplicates: false
    });
```

## Indexes

- **Removed**: `idx_tracker_data_user_id` (user_id is now part of primary key)
- **Kept**:
  - `idx_tracker_data_timestamp` (for time-based queries)
  - `idx_tracker_data_device_id` (for device filtering)
  - `idx_tracker_data_location` (spatial index for location queries)

## Rollback

If you need to rollback, you can:

1. Drop the composite primary key
2. Add back the UUID id column
3. Recreate the original primary key constraint
4. Recreate the user_id index

However, this will require handling any duplicate data that may have been created during the migration period.