# Export Functionality

This document describes the export functionality implemented in Wayli, which allows users to export their travel data in various formats.

## Overview

The export functionality provides users with the ability to export their travel data in multiple formats (GeoJSON, GPX, OwnTracks) and includes various data types (location data, trip information, want-to-visit places, and trips). Exports are processed as background jobs and stored with a 1-week TTL.

## Features

### Supported Export Formats

1. **GeoJSON** - Geographic data in JSON format
2. **GPX** - GPS Exchange Format
3. **OwnTracks** - OwnTracks recording format

### Exportable Data Types

1. **Location Data** - GPS tracking data from tracker_data table
2. **Trip Information** - Trip metadata and details
3. **Want to Visit** - Places marked as "want to visit"
4. **Trips** - Complete trip information

### Key Features

- **Background Processing** - Exports are processed as background jobs
- **Progress Tracking** - Real-time progress updates during export processing
- **File Management** - Automatic cleanup of expired exports (1-week TTL)
- **Zip Archives** - All exported data is packaged into a single ZIP file
- **Secure Downloads** - Signed URLs for secure file downloads

## Architecture

### Database Schema

#### export_jobs Table

```sql
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    status TEXT CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    format TEXT CHECK (format IN ('GeoJSON', 'GPX', 'OwnTracks')),
    include_location_data BOOLEAN,
    include_trip_info BOOLEAN,
    include_want_to_visit BOOLEAN,
    include_trips BOOLEAN,
    file_path TEXT,
    file_size BIGINT,
    expires_at TIMESTAMP WITH TIME ZONE,
    progress INTEGER,
    result JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### Storage

- **Export Bucket** - `exports` bucket for storing export files
- **File Structure** - `{user_id}/{export_filename}.zip`
- **TTL** - 1 week automatic expiration

### API Endpoints

#### POST /api/v1/export

Creates a new export job.

**Request Body:**

```json
{
	"format": "GeoJSON",
	"includeLocationData": true,
	"includeTripInfo": true,
	"includeWantToVisit": true,
	"includeTrips": true
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"exportJobId": "uuid",
		"message": "Export job created successfully"
	}
}
```

#### GET /api/v1/export

Retrieves user's export jobs.

**Response:**

```json
{
	"success": true,
	"data": [
		{
			"id": "uuid",
			"status": "completed",
			"format": "GeoJSON",
			"file_path": "user_id/export_123.zip",
			"file_size": 1024,
			"expires_at": "2024-01-15T10:00:00Z",
			"progress": 100,
			"created_at": "2024-01-08T10:00:00Z"
		}
	]
}
```

#### GET /api/v1/export/{job_id}/download

Downloads a completed export file.

**Response:** Redirects to signed download URL

## Background Job Processing

### Job Type

- **Type:** `data_export`
- **Processor:** `ExportProcessorService.processExport()`

### Processing Steps

1. **Job Creation** - Export job is created in `export_jobs` table
2. **Background Processing** - Job is picked up by worker
3. **Data Export** - Data is exported in requested format
4. **Zip Creation** - All files are packaged into ZIP archive
5. **Storage Upload** - ZIP file is uploaded to exports bucket
6. **Job Completion** - Job status is updated to completed

### Progress Updates

The export processor provides real-time progress updates:

- 10% - Starting export process
- 20% - Exporting location data
- 40% - Exporting trip information
- 60% - Exporting want-to-visit places
- 80% - Exporting trips
- 90% - Creating zip file
- 100% - Upload complete

## Frontend Components

### Import/Export Page

- Export format selection (GeoJSON, GPX, OwnTracks)
- Data type checkboxes
- Export button
- Export history display

### ExportJobs Component

- Displays export job history
- Real-time progress updates
- Download buttons for completed exports
- Status indicators and error messages

## Data Format Conversion

### GeoJSON Format

```json
{
  "type": "FeatureCollection",
  "name": "Location Data",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [longitude, latitude]
      },
      "properties": {
        "recorded_at": "2024-01-08T10:00:00Z",
        "altitude": 100,
        "accuracy": 5,
        "speed": 10,
        "heading": 45,
        "battery_level": 80,
        "is_charging": false,
        "activity_type": "walking",
        "country_code": "US"
      }
    }
  ]
}
```

### GPX Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wayli Export" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Location Data</name>
    <time>2024-01-08T10:00:00Z</time>
  </metadata>
  <trk>
    <name>Location Data</name>
    <trkseg>
      <trkpt lat="40.7128" lon="-74.0060">
        <time>2024-01-08T10:00:00Z</time>
        <ele>100</ele>
        <speed>10</speed>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

### OwnTracks Format

```
1704715200,40.7128,-74.0060,100,5,10,45,80,0,walking
```

## Security

### Row Level Security (RLS)

- Users can only access their own export jobs
- Export files are stored in user-specific folders
- Signed URLs with 1-hour expiration for downloads

### Storage Policies

- Users can only upload to their own folder in exports bucket
- Users can only view their own export files
- Service role has access for background processing

## Cleanup and Maintenance

### Automatic Cleanup

- `cleanup_expired_exports()` function removes expired files
- Runs automatically or can be called manually
- Deletes both storage files and database records

### Manual Cleanup

```sql
SELECT cleanup_expired_exports();
```

## Testing

### Test Script

Run the export functionality test:

```bash
bun run scripts/test-export.ts
```

### Test Coverage

- Export bucket existence
- Export jobs table existence
- Cleanup function functionality
- Background job processing

## Error Handling

### Common Errors

- **File not found** - Export file has expired or doesn't exist
- **Job failed** - Processing error during export
- **Invalid format** - Unsupported export format
- **No data selected** - User must select at least one data type

### Error Recovery

- Failed jobs can be retried
- Expired files are automatically cleaned up
- User-friendly error messages in UI

## Future Enhancements

### Potential Improvements

- **Additional Formats** - KML, CSV, JSON
- **Custom Date Ranges** - Export data for specific time periods
- **Batch Exports** - Multiple format exports in single job
- **Export Templates** - Predefined export configurations
- **Email Notifications** - Notify users when exports are ready
- **Export Scheduling** - Recurring exports

### Performance Optimizations

- **Streaming Exports** - Handle large datasets more efficiently
- **Compression Options** - Different compression levels
- **Parallel Processing** - Export multiple data types simultaneously
- **Caching** - Cache frequently requested exports
