# Edge Functions Deployment Guide (Self-Hosted)

## Prerequisites

1. **Project Reference ID**: You need the project reference ID for your self-hosted Supabase instance
2. **Access Token**: Supabase access token for authentication
3. **Environment Variables**: Configure secrets for the functions

## Finding Your Project Reference ID

The project reference ID is typically found in:
- Your Supabase dashboard URL
- Environment configuration files
- Supabase CLI configuration

It should look like: `abcdefghijklmnopqrst`

## Deployment Steps

### Step 1: Set Access Token

```bash
export SUPABASE_ACCESS_TOKEN="your-access-token-here"
```

### Step 2: Link to Your Project

```bash
bun x supabase link --project-ref YOUR_PROJECT_REF_ID
```

### Step 3: Set Environment Variables

```bash
# Set Nominatim configuration
bun x supabase secrets set NOMINATIM_ENDPOINT=https://nominatim.int.hazen.nu --project-ref YOUR_PROJECT_REF_ID
bun x supabase secrets set NOMINATIM_RATE_LIMIT=1000 --project-ref YOUR_PROJECT_REF_ID

# Set job processing variables
bun x supabase secrets set JOB_TIMEOUT_SECONDS=300 --project-ref YOUR_PROJECT_REF_ID
bun x supabase secrets set MAX_CONCURRENT_JOBS=5 --project-ref YOUR_PROJECT_REF_ID
```

### Step 4: Deploy All Functions

```bash
# Deploy all functions at once
bun x supabase functions deploy --project-ref YOUR_PROJECT_REF_ID

# Or deploy individual functions
bun x supabase functions deploy geocode-search --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy statistics --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy trip-locations --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy import --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy import-progress --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy jobs --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy trip-exclusions --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy owntracks-points --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy poi-visit-detection --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy admin-users --project-ref YOUR_PROJECT_REF_ID
bun x supabase functions deploy admin-workers --project-ref YOUR_PROJECT_REF_ID
```

## Testing Deployed Functions

Once deployed, functions will be available at:
`https://supabase.int.hazen.nu/functions/v1/{function-name}`

### Example Test

```bash
# Test geocoding function
curl -X GET "https://supabase.int.hazen.nu/functions/v1/geocode-search?q=Amsterdam" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Alternative Deployment Methods

If the standard Supabase CLI deployment doesn't work for your self-hosted setup, you may need to:

1. **Manual File Upload**: Upload the function files directly to your Supabase instance
2. **Custom Deployment Script**: Use a custom script specific to your self-hosted setup
3. **Docker Deployment**: Deploy functions as part of your Supabase Docker setup

## Troubleshooting

### Common Issues

1. **"Invalid project ref format"**: Make sure you're using the correct project reference ID
2. **"Access token not provided"**: Set the SUPABASE_ACCESS_TOKEN environment variable
3. **"Functions not found"**: Ensure functions are deployed before testing
4. **"502 Bad Gateway"**: Functions endpoint exists but functions aren't deployed yet

### Getting Help

- Check your self-hosted Supabase logs for deployment errors
- Verify your project reference ID and access token
- Ensure your self-hosted instance supports Edge Functions