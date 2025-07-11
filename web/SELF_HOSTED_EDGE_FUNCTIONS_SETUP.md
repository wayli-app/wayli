# Self-Hosted Supabase Edge Functions Setup Guide

## Overview

This guide explains how to set up and deploy Edge Functions on your self-hosted Supabase instance at `https://supabase.int.hazen.nu`.

## Prerequisites

1. **Self-hosted Supabase instance** with admin access
2. **Docker** (if using Docker deployment)
3. **Access to your Supabase configuration**

## Step 1: Enable Edge Functions in Your Self-Hosted Instance

### Option A: Docker Compose Setup

If you're using Docker Compose, you need to add the Edge Functions service to your `docker-compose.yml`:

```yaml
services:
  # ... existing services ...

  edge-runtime:
    image: supabase/edge-runtime:latest
    container_name: supabase_edge_runtime
    ports:
      - "9000:9000"
    environment:
      - SUPABASE_URL=http://kong:8000
      - SUPABASE_ANON_KEY=your-anon-key
      - SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
      - JWT_SECRET=your-jwt-secret
    volumes:
      - ./supabase/functions:/home/deno/functions
    depends_on:
      - kong
      - postgres
      - auth
      - rest
      - realtime
      - storage
      - edge-runtime
    networks:
      - supabase

  # Add edge-runtime to Kong configuration
  kong:
    # ... existing kong config ...
    environment:
      # ... existing environment variables ...
      - KONG_UPSTREAM_EDGE_RUNTIME=http://edge-runtime:9000
```

### Option B: Manual Setup

If you're not using Docker, you'll need to:

1. **Install Deno** (required for Edge Functions runtime)
2. **Configure your reverse proxy** to route `/functions/v1/*` to the Edge Functions runtime
3. **Set up the Edge Functions runtime** as a separate service

## Step 2: Configure Environment Variables

Set these environment variables for your Edge Functions:

```bash
# Required for Edge Functions
SUPABASE_URL=https://supabase.int.hazen.nu
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUxNTgwMDAwLCJleHAiOjE5MDkzNDY0MDB9.zm02o7vuCndmRp5PzaXh36DEwioJFeXSjQ-IlkQVkQg
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NTE1ODAwMDAsImV4cCI6MTkwOTM0NjQwMH0._6nGZcqo0Btk_8DEgJkOPDeuIgmbNYkAr0fXNsTUb08

# Function-specific variables
NOMINATIM_ENDPOINT=https://nominatim.int.hazen.nu
NOMINATIM_RATE_LIMIT=1000
JOB_TIMEOUT_SECONDS=300
MAX_CONCURRENT_JOBS=5
```

## Step 3: Deploy Functions

### Method 1: Direct File Copy (Recommended for Self-Hosted)

1. **Copy function files** to your Supabase instance:

```bash
# Create functions directory on your server
mkdir -p /path/to/supabase/functions

# Copy all functions
scp -r supabase/functions/* user@your-server:/path/to/supabase/functions/
```

2. **Restart the Edge Functions runtime**:

```bash
# If using Docker
docker-compose restart edge-runtime

# If using systemd
sudo systemctl restart supabase-edge-runtime
```

### Method 2: Using Supabase CLI (if configured)

If you can configure the CLI for your self-hosted instance:

```bash
# Set the project URL
export SUPABASE_PROJECT_URL=https://supabase.int.hazen.nu

# Deploy functions
bun x supabase functions deploy --project-ref your-project-ref
```

## Step 4: Test Functions

Once deployed, test your functions:

```bash
# Test the setup function
curl -X POST "https://supabase.int.hazen.nu/functions/v1/setup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test geocoding function
curl -X GET "https://supabase.int.hazen.nu/functions/v1/geocode-search?q=Amsterdam" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Step 5: Update Frontend Configuration

Update your frontend to use the new Edge Functions endpoints:

```typescript
// In your API service files, replace SvelteKit API routes with Edge Functions
const API_BASE = 'https://supabase.int.hazen.nu/functions/v1';

// Example: Replace /api/v1/geocode/search with /functions/v1/geocode-search
const response = await fetch(`${API_BASE}/geocode-search?q=${query}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

## Troubleshooting

### Common Issues

1. **"Functions not found"**: Edge Functions runtime not running
2. **"502 Bad Gateway"**: Functions endpoint not configured in reverse proxy
3. **"401 Unauthorized"**: JWT token issues or CORS problems
4. **"500 Internal Server Error"**: Function code errors or missing dependencies

### Debugging Steps

1. **Check Edge Functions runtime logs**:
   ```bash
   docker-compose logs edge-runtime
   ```

2. **Verify function files are in place**:
   ```bash
   ls -la /path/to/supabase/functions/
   ```

3. **Test function endpoints directly**:
   ```bash
   curl -v "https://supabase.int.hazen.nu/functions/v1/setup"
   ```

4. **Check environment variables**:
   ```bash
   docker-compose exec edge-runtime env | grep SUPABASE
   ```

## Function List

The following functions are ready for deployment:

- `setup` - Database initialization and setup
- `geocode-search` - Location search and geocoding
- `statistics` - User and trip statistics
- `trip-locations` - Trip location management
- `import` - Data import functionality
- `import-progress` - Import progress tracking
- `jobs` - Background job management
- `trip-exclusions` - Trip exclusion rules
- `owntracks-points` - OwnTracks integration
- `poi-visit-detection` - Points of interest detection
- `admin-users` - User administration
- `admin-workers` - Worker management

## Next Steps

1. **Enable Edge Functions** in your self-hosted Supabase instance
2. **Deploy the functions** using one of the methods above
3. **Test the functions** to ensure they work correctly
4. **Update your frontend** to use the new Edge Functions endpoints
5. **Remove old SvelteKit API routes** once migration is complete

## Support

If you encounter issues with your self-hosted setup:

1. Check the Supabase self-hosted documentation
2. Review your Docker Compose configuration
3. Verify all environment variables are set correctly
4. Check the Edge Functions runtime logs for errors