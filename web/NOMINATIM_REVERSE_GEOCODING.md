# Nominatim Reverse Geocoding

This document explains how to use the Nominatim reverse geocoding feature in Wayli.

## Overview

The reverse geocoding feature automatically converts GPS coordinates (latitude/longitude) into human-readable addresses using the Nominatim service. This is useful for:

- Adding readable addresses to locations and points of interest
- Improving the user experience by showing meaningful location names
- Enabling location-based features that require address information

## Features

- **Configurable endpoint**: Use any Nominatim-compatible service
- **Rate limiting**: Configurable requests per second to respect API limits
- **Resumable jobs**: Jobs can be stopped and resumed without losing progress
- **Progress tracking**: Real-time progress updates during geocoding
- **Error handling**: Individual point failures don't stop the entire job
- **Duplicate prevention**: Already geocoded points are skipped

## Setup

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Nominatim configuration
NOMINATIM_ENDPOINT=https://nominatim.openstreetmap.org
NOMINATIM_RATE_LIMIT=1 # requests per second
```

**Configuration Options:**

- `NOMINATIM_ENDPOINT`: The base Nominatim service URL (without `/reverse` suffix)
  - Default: `https://nominatim.openstreetmap.org`
  - You can use any Nominatim-compatible service
  - The `/reverse` endpoint will be automatically appended
- `NOMINATIM_RATE_LIMIT`: Maximum requests per second
  - Default: `1` (respects Nominatim's usage policy)
  - Increase only if you have permission from the service provider

### 2. Database Migration

Run the database migration to create the required tables:

```sql
-- This is included in setup-database.sql
-- If you need to add it manually:
ALTER TABLE %%SCHEMA%%.geocoded_points ENABLE ROW LEVEL SECURITY;
```

## Usage

### Running Reverse Geocoding Jobs

1. **Navigate to Jobs**: Go to your dashboard → Jobs
2. **Select Job Type**: Choose one of the reverse geocoding options:
   - **Reverse Geocoding: Missing Points**: Only processes points without addresses
3. **Start Job**: Click "Start Job" to begin the geocoding process

### Job Types

#### Missing Points (`reverse_geocoding_missing`)
- Only processes points that have coordinates but no address
- Faster than full refresh
- Useful for regular maintenance

### Progress Tracking

Jobs provide real-time progress updates:
- **Progress percentage**: Overall completion
- **Processed count**: Number of successfully geocoded points
- **Total count**: Total points to process
- **Current position**: Current point being processed

### Job Results

When a job completes, you'll see:
- **Success message**: Summary of processed points
- **Error details**: Any points that failed to geocode
- **Completion time**: When the job finished

## Technical Details

### Database Schema

The system uses a `geocoded_points` table to track geocoding status:

```sql
CREATE TABLE geocoded_points (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    table_name TEXT NOT NULL, -- 'locations' or 'points_of_interest'
    record_id UUID NOT NULL, -- ID of the record in the source table
    location GEOMETRY(POINT, 4326), -- PostGIS point
    address TEXT, -- Reverse geocoded address
    geocoding_data JSONB, -- Full response from Nominatim
    geocoded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(table_name, record_id)
);
```

### Rate Limiting

The service implements automatic rate limiting:
- Respects the `NOMINATIM_RATE_LIMIT` configuration
- Ensures requests are spaced appropriately
- Prevents overwhelming the Nominatim service

### Error Handling

- **Individual failures**: If a single point fails, the job continues with the next point
- **Network errors**: Automatic retry with exponential backoff
- **Invalid coordinates**: Points with invalid location data are skipped
- **Service errors**: Nominatim errors are logged but don't stop the job

### Resumability

Jobs can be safely stopped and resumed:
- Progress is tracked in the `geocoded_points` table
- Already processed points are skipped on restart
- No duplicate work is performed

## Testing

### Test the Nominatim Service

Run the test script to verify the service works:

```bash
cd web
bun run src/scripts/test-nominatim.ts
```

This will test geocoding with sample coordinates and verify rate limiting.

### Test with Sample Data

1. Create some locations or points of interest with coordinates but no addresses
2. Run a reverse geocoding job
3. Verify that addresses are added to the records

## Troubleshooting

### Common Issues

**Job fails immediately:**
- Check that the `NOMINATIM_ENDPOINT` is accessible
- Verify your network connection
- Check the job logs for specific error messages

**No points are processed:**
- Ensure you have locations/points of interest with coordinates
- Check that the points don't already have addresses
- Verify the user has the correct permissions

**Rate limiting errors:**
- Reduce the `NOMINATIM_RATE_LIMIT` value
- Check if you're hitting the service's rate limits
- Consider using a different Nominatim instance

**Addresses not appearing:**
- Check that the job completed successfully
- Verify the `geocoded_points` table has entries
- Check that the source tables were updated

### Logs

Check the job worker logs for detailed information:
- Geocoding progress
- Individual point processing
- Error messages
- Rate limiting behavior

## Best Practices

1. **Respect rate limits**: Don't increase the rate limit unless you have permission
2. **Use appropriate job types**: Use "Missing Points" for regular maintenance
3. **Monitor progress**: Check job progress for large datasets
4. **Test first**: Use the test script before running on production data
5. **Backup data**: Consider backing up your data before running full refresh jobs

## API Reference

### Environment Variables

```bash
# Base Nominatim service URL (without /reverse suffix)
NOMINATIM_ENDPOINT=https://nominatim.openstreetmap.org

# Rate limiting (requests per second)
NOMINATIM_RATE_LIMIT=1
```

### NominatimService

```typescript
import { reverseGeocode, NominatimResponse } from '$lib/services/nominatim.service';

// Reverse geocode coordinates
const result: NominatimResponse = await reverseGeocode(lat, lon);
console.log(result.display_name); // Human-readable address
console.log(result.address); // Structured address components
```

### NominatimResponse

```typescript
interface NominatimResponse {
  display_name: string;           // Human-readable address
  address?: Record<string, string>; // Structured address components
  place_id: number;              // Nominatim place ID
  lat: string;                   // Latitude
  lon: string;                   // Longitude
  type: string;                  // Place type
  [key: string]: unknown;        // Additional fields
}
```