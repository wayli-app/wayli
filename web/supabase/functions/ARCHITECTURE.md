# Edge Functions Architecture

## Overview

This document describes the architecture of our Supabase Edge Functions, which has evolved from individual function endpoints to a centralized main service approach.

## Architecture Evolution

### Before: Individual Functions (Legacy)

```
/functions/
├── health/
│   └── index.ts
├── auth-check-2fa/
│   └── index.ts
├── auth-password/
│   └── index.ts
├── trips/
│   └── index.ts
├── jobs/
│   └── index.ts
└── ... (30+ individual functions)
```

**Problems with this approach:**

- ❌ 30+ separate functions to deploy and manage
- ❌ Inconsistent CORS handling across functions
- ❌ Duplicate error handling code
- ❌ Difficult to maintain and debug
- ❌ No centralized logging or monitoring
- ❌ Complex deployment process

### After: Main Service (Current)

```
/functions/
├── main/
│   ├── index.ts          # Main router/dispatcher
│   ├── handlers/         # Individual endpoint handlers
│   │   ├── health.ts
│   │   ├── auth.ts
│   │   ├── trips.ts
│   │   ├── jobs.ts
│   │   └── ... (other handlers)
│   └── README.md
├── _shared/              # Shared utilities
│   └── cors.ts
└── ... (legacy functions - to be removed)
```

**Benefits of this approach:**

- ✅ Single function to deploy and manage
- ✅ Centralized CORS handling
- ✅ Unified error handling and logging
- ✅ Consistent API patterns
- ✅ Easier debugging and monitoring
- ✅ Simplified deployment process

## Main Service Architecture

### 1. Router (`main/index.ts`)

The main service acts as a router that:

- Receives all incoming requests
- Parses the URL path and query parameters
- Routes requests to appropriate handlers
- Handles CORS preflight requests
- Provides consistent error handling
- Logs all requests and errors

### 2. Handlers (`main/handlers/`)

Each handler is responsible for:

- Processing requests for a specific domain (auth, trips, jobs, etc.)
- Routing to sub-handlers based on `action` query parameter
- Implementing the actual business logic
- Returning appropriate responses

### 3. Request Flow

```
Client Request → Main Service → Router → Handler → Response
     ↓              ↓           ↓         ↓         ↓
  /functions/    Parse URL   Route to   Execute   Return
     main/       & params    handler    logic     response
```

## URL Structure

### Base Pattern

```
/functions/main/{endpoint}?action={action}&{other_params}
```

### Examples

```
# Health check
GET /functions/main/health

# Authentication
GET /functions/main/auth?action=check-2fa
GET /functions/main/auth?action=password

# Trips
GET /functions/main/trips?action=list
POST /functions/main/trips?action=create

# Jobs
GET /functions/main/jobs?action=progress
GET /functions/main/jobs?action=stream
```

## Migration Strategy

### Phase 1: Create Main Service ✅

- [x] Create main service router
- [x] Create placeholder handlers
- [x] Test basic routing functionality

### Phase 2: Implement Handlers

- [ ] Extract business logic from existing functions
- [ ] Integrate logic into appropriate handlers
- [ ] Test each endpoint thoroughly

### Phase 3: Update Frontend

- [ ] Update all API calls to use main service
- [ ] Test frontend functionality
- [ ] Verify no regressions

### Phase 4: Cleanup

- [ ] Remove old individual functions
- [ ] Update documentation
- [ ] Update deployment scripts

## Implementation Details

### Handler Pattern

Each handler follows this pattern:

```typescript
export async function handleEndpoint(req: Request, params: URLSearchParams): Promise<Response> {
	const action = params.get('action');

	if (!action) {
		return errorResponse('Missing action parameter', availableActions);
	}

	switch (action) {
		case 'action1':
			return await handleAction1(req, params);
		case 'action2':
			return await handleAction2(req, params);
		default:
			return errorResponse('Invalid action', availableActions);
	}
}
```

### Error Handling

All errors are handled consistently:

- 400: Bad Request (missing/invalid parameters)
- 404: Not Found (invalid endpoint)
- 500: Internal Server Error (unexpected errors)

### CORS

CORS is handled centrally in the main service, ensuring all endpoints have consistent CORS headers.

## Future Enhancements

### 1. Middleware System

```typescript
// Authentication middleware
const authMiddleware = async (req: Request, next: NextFunction) => {
	// Check authentication
	// Call next() if authenticated
	// Return error if not authenticated
};
```

### 2. Rate Limiting

```typescript
// Rate limiting middleware
const rateLimitMiddleware = async (req: Request, next: NextFunction) => {
	// Check rate limits
	// Call next() if within limits
	// Return 429 if rate limited
};
```

### 3. Request Validation

```typescript
// Validation middleware
const validationMiddleware = async (req: Request, next: NextFunction) => {
	// Validate request body/params
	// Call next() if valid
	// Return 400 if invalid
};
```

### 4. Metrics Collection

```typescript
// Metrics middleware
const metricsMiddleware = async (req: Request, next: NextFunction) => {
	const start = Date.now();
	const response = await next();
	const duration = Date.now() - start;

	// Log metrics
	logMetrics(req.url, response.status, duration);

	return response;
};
```

## Benefits Summary

1. **Maintainability**: Single codebase to maintain
2. **Consistency**: Unified error handling and responses
3. **Debugging**: Centralized logging and monitoring
4. **Deployment**: Single function to deploy
5. **Scalability**: Easy to add new endpoints and handlers
6. **Testing**: Simplified testing with single entry point
7. **Documentation**: Single API to document
8. **Performance**: Reduced cold start overhead

## Conclusion

The main service architecture provides a much cleaner, more maintainable approach to Edge Functions. It eliminates the complexity of managing multiple functions while providing a consistent, scalable foundation for future development.
