# Database Migration System

This document describes the database migration system for the Wayli project.

## Overview

The migration system provides a robust way to manage database schema changes across different environments. It tracks applied migrations, ensures idempotent operations, and provides proper error handling.

## Architecture

### Components

1. **DatabaseMigrationService** (`src/lib/services/database/migration.service.ts`)
   - Core service for managing migrations
   - Discovers available migrations from the filesystem
   - Tracks applied migrations in the database
   - Applies pending migrations with proper error handling

2. **Migration Files** (`supabase/migrations/`)
   - SQL files with timestamp-based naming
   - Format: `YYYYMMDDHHMMSS_description.sql`
   - Each migration is idempotent and can be run multiple times safely

3. **Migration Tracking Table** (`database_migrations`)
   - Stores metadata about applied migrations
   - Includes version, name, checksum, execution time, and error messages
   - Protected by Row Level Security (RLS)

4. **exec_sql Function**
   - Custom PostgreSQL function for executing dynamic SQL
   - Required for the migration system to work
   - Created by the infrastructure migration

## Usage

### Running Migrations

```bash
# Run all pending migrations
npm run migrate

# Test the migration system
npm run migrate:test

# Build migration system (for production)
npm run migrate:build

# Run migrations in production
npm run migrate:run

# Bootstrap migration infrastructure
npm run migrate:bootstrap

# Setup migration infrastructure manually
npm run migrate:setup
```

### Scripts

- **`scripts/run-migrations.ts`**: Main script to run all pending migrations
- **`scripts/test-migration-system.ts`**: Test script to verify migration system functionality

## Migration File Format

Each migration file should:

1. Be named with a timestamp: `YYYYMMDDHHMMSS_description.sql`
2. Be idempotent (safe to run multiple times)
3. Use `IF NOT EXISTS` for creating objects
4. Handle existing constraints gracefully
5. Include proper error handling

### Example Migration

```sql
-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.example_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'example_table_name_check'
        AND conrelid = 'public.example_table'::regclass
    ) THEN
        ALTER TABLE public.example_table
        ADD CONSTRAINT example_table_name_check
        CHECK (length(name) > 0);
    END IF;
END $$;
```

## Security

- Migration tracking table is protected by RLS
- Only service role can access migration metadata
- `exec_sql` function has `SECURITY DEFINER` for proper permissions
- All migrations run with service role privileges

## Error Handling

- Failed migrations are logged with error messages
- Migration process stops on first failure
- Execution time is tracked for performance monitoring
- Checksums ensure migration integrity

## Production Deployment

For production deployment in an initContainer:

1. Ensure the migration infrastructure is set up
2. Run `npm run migrate` to apply all pending migrations
3. The system will automatically handle existing database objects
4. All migrations are idempotent and safe to run multiple times

## Best Practices

1. **Always use `IF NOT EXISTS`** for creating database objects
2. **Check for existing constraints** before adding them
3. **Use descriptive migration names** that explain the change
4. **Test migrations** in development before deploying
5. **Keep migrations small and focused** on single changes
6. **Document breaking changes** in migration comments
