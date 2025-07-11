# Supabase Edge Functions Migration Plan

## Overview

This document outlines the migration strategy from SvelteKit API routes to Supabase Edge Functions for better integration with the Supabase ecosystem.

## Benefits of Edge Functions

- **Better Supabase Integration**: Native access to Supabase services
- **Reduced Complexity**: No need to manage separate API infrastructure
- **Better Performance**: Edge deployment closer to users
- **Simplified Authentication**: Built-in JWT handling
- **Cost Effective**: Pay-per-use model
- **Automatic Scaling**: Handles traffic spikes automatically

## Migration Priority

### Phase 1: External API Dependencies (High Priority)
These endpoints make external API calls and would benefit most from Edge Functions:

1. **Geocoding Services**
   - `GET /api/v1/geocode/search` → `supabase/functions/geocode-search`
   - Nominatim integration with rate limiting

2. **Trip Exclusions**
   - `POST /api/v1/trip-exclusions` → `supabase/functions/trip-exclusions`
   - `PUT /api/v1/trip-exclusions` → `supabase/functions/trip-exclusions`
   - Geocoding integration for exclusion addresses

3. **OwnTracks Integration**
   - `POST /api/v1/owntracks/points` → `supabase/functions/owntracks-points`
   - Reverse geocoding for incoming location data

### Phase 2: Complex Data Processing (Medium Priority)
These endpoints perform heavy computations:

1. **Statistics API**
   - `GET /api/v1/statistics` → `supabase/functions/statistics`
   - Distance calculations, country analysis, time spent calculations

2. **Trip Locations API**
   - `GET /api/v1/trips/locations` → `supabase/functions/trip-locations`
   - Complex queries with multiple data sources

3. **POI Visit Detection**
   - `POST /api/v1/poi-visits/detect` → `supabase/functions/poi-visit-detection`
   - Background processing for visit detection

### Phase 3: Job Processing (Medium Priority)
Background job management:

1. **Job Management**
   - `GET /api/v1/jobs` → `supabase/functions/jobs`
   - `POST /api/v1/jobs` → `supabase/functions/jobs`

2. **Import Processing**
   - `POST /api/v1/import` → `supabase/functions/import`
   - `GET /api/v1/import/progress` → `supabase/functions/import-progress`

### Phase 4: Admin Operations (Low Priority)
Admin-specific functionality:

1. **User Management**
   - `GET /api/v1/admin/users` → `supabase/functions/admin-users`
   - `PUT /api/v1/admin/users/[user_id]` → `supabase/functions/admin-users`

2. **Worker Management**
   - `POST /api/v1/admin/workers` → `supabase/functions/admin-workers`

### Keep as SvelteKit Routes
Simple CRUD operations that don't need Edge Functions:

1. **Basic CRUD**
   - `GET /api/v1/trips` (simple database queries)
   - `POST /api/v1/trips` (simple inserts)
   - `GET /api/v1/auth/*` (authentication flows)

2. **Setup Operations**
   - `GET /api/v1/setup/health` (health checks)
   - `POST /api/v1/setup/init-database` (one-time setup)

## Implementation Steps

### Step 1: Set up Supabase CLI and Edge Functions (Self-Hosted)

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase project (if not already done)
supabase init

# Link to your self-hosted instance
supabase link --project-ref your-self-hosted-instance

# Create Edge Functions directory structure
mkdir -p supabase/functions
```

### Step 2: Create Edge Function Structure

```
supabase/functions/
├── geocode-search/
│   ├── index.ts
│   └── package.json
├── trip-exclusions/
│   ├── index.ts
│   └── package.json
├── owntracks-points/
│   ├── index.ts
│   └── package.json
├── statistics/
│   ├── index.ts
│   └── package.json
├── trip-locations/
│   ├── index.ts
│   └── package.json
├── poi-visit-detection/
│   ├── index.ts
│   └── package.json
├── jobs/
│   ├── index.ts
│   └── package.json
├── import/
│   ├── index.ts
│   └── package.json
├── import-progress/
│   ├── index.ts
│   └── package.json
├── admin-users/
│   ├── index.ts
│   └── package.json
└── admin-workers/
    ├── index.ts
    └── package.json
```

### Step 3: Environment Variables

Create `supabase/functions/.env` for Edge Function environment variables:

```env
# Nominatim Configuration
NOMINATIM_ENDPOINT=https://nominatim.int.hazen.nu
NOMINATIM_RATE_LIMIT=1000

# External Services
UNSPLASH_ACCESS_KEY=your_unsplash_key
COUNTRY_REVERSE_GEOCODING_ENABLED=true

# Job Processing
JOB_TIMEOUT_SECONDS=300
MAX_CONCURRENT_JOBS=5
```

### Step 4: Shared Utilities

Create `supabase/functions/_shared/` for common utilities:

```typescript
// supabase/functions/_shared/types.ts
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// supabase/functions/_shared/auth.ts
export function verifyAuth(req: Request): Promise<{ user: any; error?: string }> {
  // JWT verification logic
}

// supabase/functions/_shared/geocoding.ts
export async function reverseGeocode(lat: number, lon: number) {
  // Nominatim integration
}
```

### Step 5: Migration Examples

#### Example 1: Geocoding Search Function

```typescript
// supabase/functions/geocode-search/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { forwardGeocode } from '../_shared/geocoding.ts'

serve(async (req) => {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')

    if (!query || query.trim().length < 3) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Query must be at least 3 characters long'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const results = []
    const searchResult = await forwardGeocode(query.trim())

    if (searchResult) {
      results.push(searchResult)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { results, query: query.trim() }
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

#### Example 2: Statistics Function

```typescript
// supabase/functions/statistics/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyAuth } from '../_shared/auth.ts'

serve(async (req) => {
  try {
    // Verify authentication
    const { user, error: authError } = await verifyAuth(req)
    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: authError }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Fetch tracker data
    let trackerQuery = supabase
      .from('tracker_data')
      .select('location, recorded_at, country_code, reverse_geocode')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: true })

    if (startDate) {
      trackerQuery = trackerQuery.gte('recorded_at', startDate)
    }
    if (endDate) {
      trackerQuery = trackerQuery.lte('recorded_at', endDate + ' 23:59:59')
    }

    const { data: trackerData, error } = await trackerQuery

    if (error) {
      throw error
    }

    // Calculate statistics
    const statistics = calculateStatistics(trackerData || [])

    return new Response(
      JSON.stringify({ success: true, data: statistics }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

function calculateStatistics(trackerData: any[]) {
  // Statistics calculation logic
  // (moved from current statistics API)
}
```

### Step 6: Update Frontend

Update frontend API calls to use Edge Functions:

```typescript
// Before (SvelteKit API)
const response = await fetch('/api/v1/geocode/search?q=Amsterdam')

// After (Edge Function - Self-Hosted)
const response = await fetch('https://your-self-hosted-domain.com/functions/v1/geocode-search?q=Amsterdam', {
  headers: {
    'Authorization': `Bearer ${supabase.auth.session()?.access_token}`
  }
})
```

### Step 7: Testing and Deployment (Self-Hosted)

```bash
# Test Edge Functions locally
supabase functions serve

# Deploy Edge Functions to self-hosted instance
supabase functions deploy --project-ref your-self-hosted-instance

# Deploy specific function
supabase functions deploy geocode-search --project-ref your-self-hosted-instance

# Set environment variables for your self-hosted instance
supabase secrets set NOMINATIM_ENDPOINT=https://nominatim.int.hazen.nu --project-ref your-self-hosted-instance
supabase secrets set NOMINATIM_RATE_LIMIT=1000 --project-ref your-self-hosted-instance
```

## Migration Timeline

### Week 1: Setup and Infrastructure
- Set up Supabase CLI
- Create Edge Functions structure
- Set up shared utilities
- Configure environment variables

### Week 2: Phase 1 Migration
- Migrate geocoding functions
- Migrate trip exclusions
- Migrate OwnTracks integration
- Update frontend API calls

### Week 3: Phase 2 Migration
- Migrate statistics API
- Migrate trip locations API
- Migrate POI visit detection
- Performance testing

### Week 4: Phase 3 Migration
- Migrate job management
- Migrate import processing
- Update job queue system
- Integration testing

### Week 5: Phase 4 Migration
- Migrate admin functions
- Update admin interface
- Final testing and cleanup
- Documentation updates

## Benefits After Migration

1. **Reduced Infrastructure Complexity**: No need to manage separate API server
2. **Better Performance**: Edge deployment reduces latency
3. **Automatic Scaling**: Handles traffic spikes automatically
4. **Cost Savings**: Pay-per-use model vs. always-on server
5. **Better Integration**: Native Supabase features and authentication
6. **Simplified Deployment**: Single deployment process
7. **Better Monitoring**: Built-in Supabase monitoring and logging

## Self-Hosted Considerations

### Additional Setup Requirements:
- **Resource Allocation**: Configure CPU/memory limits for function execution
- **Monitoring**: Set up logging and monitoring for function performance
- **Scaling**: Configure auto-scaling policies for your infrastructure
- **Security**: Ensure proper network security for function endpoints

### Self-Hosted Pros:
- **Full Control**: Complete control over infrastructure and scaling
- **Data Sovereignty**: All data and functions stay on your infrastructure
- **Custom Configuration**: Tailor resource allocation to your needs
- **Cost Predictability**: Fixed infrastructure costs vs. pay-per-use

### Self-Hosted Cons:
- **Infrastructure Management**: You're responsible for scaling and monitoring
- **Resource Planning**: Need to plan for peak function usage
- **Maintenance**: Keep Supabase instance and functions updated

## General Considerations

### Pros:
- Better Supabase integration
- Reduced infrastructure complexity
- Built-in authentication
- Unified deployment process
- Simplified API management

### Cons:
- Learning curve for Deno runtime
- Cold start latency
- Function size limits
- Limited runtime environment

## Next Steps

1. **Start with Phase 1**: Migrate external API dependencies first
2. **Test thoroughly**: Each function should be tested before deployment
3. **Monitor performance**: Track function execution times and costs
4. **Gradual rollout**: Migrate functions one by one to minimize risk
5. **Update documentation**: Keep migration guide updated

This migration will significantly improve the application's architecture and reduce operational complexity while leveraging Supabase's strengths.