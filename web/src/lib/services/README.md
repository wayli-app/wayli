# Service Layer Architecture

This document outlines the service layer architecture and enforces strict separation between client-safe and server-only services.

## Architecture Overview

The service layer is divided into two distinct categories to prevent environment variable leaks and ensure proper security:

### Client-Safe Services
These services can be used in:
- Svelte components (`.svelte` files)
- Client-side stores
- Client-side utilities
- Browser-safe code

**Client-Safe Services:**
- `TripsService` - Trip management using client Supabase
- `StatisticsService` - User statistics using client Supabase
- `WantToVisitService` - Want-to-visit places using client Supabase
- `LocationCacheService` - Static utility for location caching
- `ErrorHandlerService` - Error handling (accepts client via setter)
- `LoggingService` - Logging (accepts client via setter)
- `RateLimitService` - In-memory rate limiting

**Client-Safe Service Adapter:** `src/lib/services/service-layer-adapter.ts`

### Server-Only Services
These services can ONLY be used in:
- API routes (`+server.ts` files)
- Server actions
- Server-only utilities
- Background workers

**Server-Only Services:**
- `AuditLoggerService` - Audit logging using worker Supabase
- `TripImageSuggestionService` - Image suggestions using worker Supabase
- `EnhancedPoiDetectionService` - POI detection using worker Supabase
- `EnhancedTripDetectionService` - Trip detection using worker Supabase
- `TOTPService` - TOTP authentication using Node.js crypto
- `UserProfileService` - User profile management using worker Supabase
- `TripLocationsService` - Trip locations using worker Supabase
- `DatabaseMigrationService` - Database migrations using worker Supabase
- `PexelsService` - External image service using worker Supabase
- `ImageGenerationProcessorService` - Image generation using worker Supabase
- `ExportService` - Data export using server Supabase
- `ExportProcessorService` - Export processing using worker Supabase

**Server-Only Service Adapter:** `src/lib/services/server/server-service-adapter.ts`

## Supabase Client Usage

### Client Supabase (`$lib/core/supabase/client.ts`)
- Uses `$env/static/public` only
- Safe for browser usage
- Used by client-safe services

### Server Supabase (`$lib/core/supabase/server.ts`)
- Uses `$env/static/private`
- Only for server-side code
- Used by server-only services

### Worker Supabase (`$lib/core/supabase/worker.ts`)
- Uses `$env/static/private`
- Only for background workers
- Used by worker-specific services

## Critical Rules

### ❌ NEVER DO:
- Import server-only services in client-safe code
- Import `$env/static/private` in any file that could be bundled for the client
- Use server Supabase client in client-safe services
- Import server service adapter in client-side code

### ✅ ALWAYS DO:
- Use client service adapter for client-safe services
- Use server service adapter for server-only services
- Import client Supabase in client-safe services
- Import server/worker Supabase in server-only services

## Service Usage Examples

### Client-Side Usage (Components, Stores)
```typescript
import { getTripsService } from '$lib/services/service-layer-adapter';

const tripsService = getTripsService();
const trips = await tripsService.getTrips();
```

### Server-Side Usage (API Routes)
```typescript
import { getAuditLoggerService } from '$lib/services/server/server-service-adapter';

const auditLogger = getAuditLoggerService();
await auditLogger.logEvent('API_ACCESS', 'User accessed endpoint');
```

## File Organization

```
src/lib/services/
├── service-layer-adapter.ts          # Client-safe services
├── server/
│   └── server-service-adapter.ts     # Server-only services
├── trips.service.ts                  # Client-safe
├── statistics.service.ts             # Client-safe
├── want-to-visit.service.ts          # Client-safe
├── audit-logger.service.ts           # Server-only
├── trip-image-suggestion.service.ts  # Server-only
└── ...
```

## Environment Configuration

### Client Environment (`$lib/core/config/environment.ts`)
- Uses `$env/static/public` only
- Safe for browser usage

### Server Environment (`$lib/core/config/server-environment.ts`)
- Uses `$env/static/private`
- Only for server-side code

### Worker Environment (`$lib/core/config/worker-environment.ts`)
- Uses `$env/static/private` with fallbacks
- Only for worker processes

## Testing

- Client-safe services can be tested in browser environment
- Server-only services must be tested in Node.js environment
- Use appropriate mocks for Supabase clients in tests

## Migration Guide

When adding new services:

1. Determine if the service needs server environment variables
2. Choose the appropriate Supabase client (client/server/worker)
3. Add to the correct service adapter
4. Update this documentation
5. Add appropriate tests

## Troubleshooting

### Common Errors:

**"Cannot import $env/static/private into client-side code"**
- Check if a server-only service is being imported in client code
- Verify the service is in the correct adapter
- Ensure no transitive imports from server-only files

**"Service not found"**
- Check if the service is registered in the correct adapter
- Verify the import path is correct
- Ensure the service is properly exported

**"Supabase client not initialized"**
- Check if the correct Supabase client is being used
- Verify environment variables are properly configured
- Ensure the service is using the appropriate client type