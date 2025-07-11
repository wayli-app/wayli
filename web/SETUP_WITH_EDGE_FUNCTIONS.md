# Setup Guide with Edge Functions

## Overview

The Wayli application now uses Supabase Edge Functions for both database initialization and API operations. This provides better integration with the Supabase ecosystem and improved performance.

## Prerequisites

1. **Self-hosted Supabase instance** running at `https://supabase.int.hazen.nu`
2. **Project Reference ID** for your Supabase instance
3. **Access Token** for Supabase CLI authentication
4. **Environment Variables** configured in your `.env` file

## Setup Process

### Step 1: Deploy Edge Functions

First, deploy all Edge Functions to your self-hosted Supabase instance:

```bash
# Set your access token
export SUPABASE_ACCESS_TOKEN="your-access-token-here"

# Link to your project (replace with your project reference ID)
bun x supabase link --project-ref YOUR_PROJECT_REF_ID

# Deploy all Edge Functions
bun x supabase functions deploy --project-ref YOUR_PROJECT_REF_ID
```

### Step 2: Set Environment Variables

Configure the environment variables for your Edge Functions:

```bash
# Set Nominatim configuration
bun x supabase secrets set NOMINATIM_ENDPOINT=https://nominatim.int.hazen.nu --project-ref YOUR_PROJECT_REF_ID
bun x supabase secrets set NOMINATIM_RATE_LIMIT=1000 --project-ref YOUR_PROJECT_REF_ID

# Set job processing variables
bun x supabase secrets set JOB_TIMEOUT_SECONDS=300 --project-ref YOUR_PROJECT_REF_ID
bun x supabase secrets set MAX_CONCURRENT_JOBS=5 --project-ref YOUR_PROJECT_REF_ID
```

### Step 3: Initialize Database

The database initialization is now handled by the `setup` Edge Function. You can trigger it in several ways:

#### Option A: Via the Setup API (Recommended)

```bash
# Call the setup API endpoint
curl -X POST "http://localhost:3000/api/v1/setup/init-database" \
  -H "Content-Type: application/json"
```

#### Option B: Direct Edge Function Call

```bash
# Call the setup Edge Function directly
curl -X POST "https://supabase.int.hazen.nu/functions/v1/setup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -d '{"action": "init-database"}'
```

#### Option C: Full Setup (Database + Functions)

```bash
# Perform full setup including function deployment instructions
curl -X POST "https://supabase.int.hazen.nu/functions/v1/setup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -d '{"action": "full-setup"}'
```

## What the Setup Does

### Database Initialization

The setup process creates:

1. **Core Tables**:
   - `profiles` - User profiles and metadata
   - `user_preferences` - User preferences
   - `trips` - Trip data with soft deletes
   - `locations` - Location data with soft deletes
   - `points_of_interest` - POI data
   - `poi_visits` - POI visit tracking
   - `owntracks_points` - OwnTracks location data
   - `jobs` - Background job management
   - `workers` - Worker management

2. **Indexes** for optimal performance
3. **Row Level Security (RLS)** policies for data isolation
4. **Storage bucket** for trip images
5. **Database functions** for geospatial operations

### Edge Functions Deployed

The following Edge Functions are deployed and available at `/functions/v1/{name}`:

- `geocode-search` - Nominatim geocoding integration
- `statistics` - Trip and location statistics
- `trip-locations` - Trip location data retrieval
- `import` - File import job creation
- `import-progress` - Import progress tracking
- `jobs` - Job management (CRUD operations)
- `trip-exclusions` - Trip exclusion management
- `owntracks-points` - OwnTracks location data processing
- `poi-visit-detection` - POI visit detection algorithm
- `admin-users` - User management for admins
- `admin-workers` - Worker management for admins
- `setup` - Database initialization and setup management

## Testing the Setup

### Test Database Health

```bash
curl -X GET "http://localhost:3000/api/v1/setup/health"
```

### Test Edge Functions

```bash
# Test geocoding (requires authentication)
curl -X GET "https://supabase.int.hazen.nu/functions/v1/geocode-search?q=Amsterdam" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Test statistics (requires authentication)
curl -X GET "https://supabase.int.hazen.nu/functions/v1/statistics" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Migration from Old Setup

If you're migrating from the old setup process:

1. **Database**: The new setup is backward compatible and will not affect existing data
2. **API Routes**: The old SvelteKit API routes are still available but now proxy to Edge Functions
3. **Frontend**: No changes required - the frontend will automatically use the new Edge Functions

## Troubleshooting

### Common Issues

1. **"Functions not found"**: Ensure Edge Functions are deployed
2. **"Database connection failed"**: Check your Supabase URL and service role key
3. **"Authorization failed"**: Verify your JWT token is valid
4. **"Project ref format invalid"**: Use the correct project reference ID format

### Getting Help

- Check the Supabase logs for detailed error messages
- Verify all environment variables are set correctly
- Ensure your self-hosted instance supports Edge Functions

## Next Steps

After successful setup:

1. **Create your first user** through the signup process
2. **Test the geocoding functionality** by searching for locations
3. **Import some trip data** to test the import functionality
4. **Explore the admin panel** if you have admin privileges

## Architecture Benefits

The new Edge Function-based architecture provides:

- **Better Performance**: Edge deployment reduces latency
- **Simplified Management**: All functions in one place
- **Better Integration**: Native Supabase client access
- **Automatic Scaling**: Handles traffic spikes automatically
- **Cost Effective**: Pay-per-use model
- **Built-in Security**: JWT authentication handled automatically