# Database Migration System

This document describes the database migration system for the Wayli project.

## Overview

The migration system uses **Supabase CLI** to manage database schema changes across different environments. It provides version control, rollback capabilities, and ensures idempotent operations with built-in security.

> **⚠️ SECURITY NOTE:** The previous custom migration system using `exec_sql()` has been removed due to critical SQL injection vulnerabilities. Always use the official Supabase CLI for migrations.

## Architecture

### Components

1. **Supabase CLI**
   - Official tool for managing Supabase migrations
   - Tracks applied migrations automatically in `supabase_migrations` schema
   - Provides diff, push, and rollback capabilities
   - No custom infrastructure code required
   - Secure: No SQL injection risks

2. **Migration Files** (`supabase/migrations/`)
   - SQL files with timestamp-based naming
   - Format: `YYYYMMDDHHMMSS_description.sql`
   - Each migration is idempotent and can be run multiple times safely
   - Migrations are applied in chronological order

3. **Migration Tracking** (Built-in)
   - Supabase automatically tracks applied migrations in `supabase_migrations.schema_migrations`
   - No custom tables or functions needed
   - Checksums ensure migration integrity

## Installation

Install Supabase CLI:

```bash
# macOS
brew install supabase/tap/supabase

# Linux/Windows (via npm)
npm install -g supabase

# Or use the install script
curl -o- https://raw.githubusercontent.com/supabase/cli/main/install.sh | bash
```

## Usage

### Local Development

```bash
# Start local Supabase instance
supabase start

# Apply all pending migrations locally
supabase migration up

# Create a new migration file
supabase migration new <migration_name>

# Generate migration from database diff (after making changes via Studio)
supabase db diff -f <migration_name>

# Check migration status
supabase migration list

# Reset local database (WARNING: destructive)
supabase db reset

# Stop local instance
supabase stop
```

### Production Deployment

```bash
# Link to your Supabase project (one-time setup)
supabase link --project-ref $PROJECT_REF

# Push migrations to remote database
supabase db push --linked

# Push with seed data
supabase db push --linked --include-seed

# View remote migration status
supabase migration list --linked
```

### CI/CD Integration

For production deployments in Docker/Kubernetes init containers:

```bash
#!/bin/bash
# Example deployment script

# 1. Install Supabase CLI
curl -o- https://raw.githubusercontent.com/supabase/cli/main/install.sh | bash

# 2. Link to project (requires PROJECT_REF and DB_PASSWORD env vars)
supabase link \
  --project-ref $PROJECT_REF \
  --password $DB_PASSWORD

# 3. Apply migrations
supabase db push --linked

# 4. Verify success
if [ $? -eq 0 ]; then
  echo "✅ Migrations applied successfully"
  exit 0
else
  echo "❌ Migration failed"
  exit 1
fi
```

### GitHub Actions Example

```yaml
name: Deploy Migrations
on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link to Supabase Project
        run: |
          supabase link \
            --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} \
            --password ${{ secrets.SUPABASE_DB_PASSWORD }}

      - name: Push Migrations
        run: supabase db push --linked
```

## Migration File Format

Each migration file should:

1. Be named with a timestamp: `YYYYMMDDHHMMSS_description.sql`
2. Be idempotent (safe to run multiple times)
3. Use `IF NOT EXISTS` for creating objects
4. Handle existing constraints gracefully
5. Include proper error handling with `DO $$ ... EXCEPTION ... END $$` blocks

### Example Migration

```sql
-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.example_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.example_table ENABLE ROW LEVEL SECURITY;

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
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adding constraint: %', SQLERRM;
END $$;

-- Create RLS policy if it doesn't exist
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view their own data" ON public.example_table;

    CREATE POLICY "Users can view their own data"
    ON public.example_table
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating policy: %', SQLERRM;
END $$;
```

## Security

### Built-in Security Features

- **No SQL Injection**: Supabase CLI uses prepared statements, no dynamic SQL execution
- **Atomic Transactions**: Each migration runs in a transaction, rolls back on failure
- **Version Control**: All migrations are tracked in git and the database
- **Audit Trail**: Migration history is preserved in `supabase_migrations.schema_migrations`

### Security Best Practices

1. **Never use `EXECUTE` with unsanitized input** in migrations
2. **Always enable RLS** on new tables
3. **Grant minimal permissions** - avoid `GRANT ALL` to anon/authenticated
4. **Use SECURITY DEFINER carefully** - always set `search_path TO ''`
5. **Validate input parameters** in functions to prevent DoS
6. **Review migrations** before applying to production

### Removed Security Vulnerabilities

The following components have been **removed** due to security issues:

- ❌ `exec_sql()` function - SQL injection vulnerability
- ❌ Custom TypeScript migration runner - bypassed Supabase security
- ❌ `database_migrations` table - replaced by built-in tracking
- ❌ Direct RPC calls for schema changes - unsafe pattern

## Error Handling

- **Failed migrations are automatically rolled back** by Supabase CLI
- **Error messages are displayed** with context
- **Migration process stops** on first failure
- **Local testing** should always be done before production deployment
- **Rollback capability**: Use git to revert migration files, then `supabase db push`

## Production Deployment Workflow

### Recommended Workflow

1. **Develop Locally**
   ```bash
   supabase start
   # Make schema changes via SQL or Studio
   supabase db diff -f my_new_feature
   # Review generated migration
   git add supabase/migrations/
   git commit -m "Add new feature schema"
   ```

2. **Test in Staging**
   ```bash
   supabase link --project-ref $STAGING_PROJECT_REF
   supabase db push --linked
   # Test the application
   ```

3. **Deploy to Production**
   ```bash
   # Via CI/CD or manually
   supabase link --project-ref $PROD_PROJECT_REF
   supabase db push --linked
   ```

4. **Monitor**
   ```bash
   # Check migration status
   supabase migration list --linked
   # Check database health
   supabase db inspect
   ```

## Troubleshooting

### Common Issues

**Migration fails due to existing objects:**
- Ensure your migration uses `IF NOT EXISTS` and `DO $$ ... EXCEPTION` blocks
- Test idempotency by running the migration twice locally

**Permission denied errors:**
- Check that you're linked to the correct project
- Verify database password is correct
- Ensure service role has necessary permissions

**Migration not detected:**
- Check filename format: `YYYYMMDDHHMMSS_description.sql`
- Ensure file is in `supabase/migrations/` directory
- Run `supabase migration list` to see available migrations

**Rollback needed:**
```bash
# Create a new migration that reverses changes
supabase migration new revert_previous_change

# Or reset to a previous state (DESTRUCTIVE)
supabase db reset
```

## Best Practices

1. **Always use `IF NOT EXISTS`** for creating database objects
2. **Wrap DDL in `DO $$ ... EXCEPTION` blocks** for graceful error handling
3. **Test migrations locally** before applying to staging/production
4. **Use descriptive migration names** that explain the change
5. **Keep migrations small and focused** on single logical changes
6. **Never edit existing migrations** that have been applied to production
7. **Document breaking changes** in migration comments
8. **Review security implications** of all schema changes
9. **Enable RLS by default** on all new tables
10. **Grant minimal permissions** - only what's necessary

## Migration Naming Convention

Use descriptive names that explain **what** changed and **why**:

```
✅ Good:
20251003120000_add_user_profiles_table.sql
20251003120100_add_rls_to_user_profiles.sql
20251003120200_fix_worker_job_policy.sql
20251003120300_add_storage_policies.sql

❌ Bad:
20251003120000_update.sql
20251003120100_fix.sql
20251003120200_changes.sql
```

## References

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/deployment/database-migrations)
- [Local Development](https://supabase.com/docs/guides/local-development/overview)
- [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
