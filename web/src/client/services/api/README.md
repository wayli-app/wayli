# API Service Layer Documentation

This directory contains the API service layer that extracts business logic from API routes and provides a clean, testable interface for handling HTTP requests.

## 🏗️ Architecture Overview

The API service layer follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    API Layer Architecture                   │
├─────────────────────────────────────────────────────────────┤
│  API Routes (HTTP Layer)                                    │
│  ├── +server.ts files                                       │
│  └── Base handlers (createGetHandler, createPostHandler)    │
├─────────────────────────────────────────────────────────────┤
│  API Services (Business Logic Layer)                        │
│  ├── JobsApiService                                         │
│  ├── TripsApiService                                        │
│  ├── UsersApiService                                        │
│  └── AuthApiService                                         │
├─────────────────────────────────────────────────────────────┤
│  Core Services (Data Layer)                                 │
│  ├── JobQueueService                                        │
│  ├── TripService                                            │
│  ├── UserService                                            │
│  └── AuthService                                            │
├─────────────────────────────────────────────────────────────┤
│  Database Layer                                             │
│  ├── Supabase Client                                        │
│  └── Database Operations                                     │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Service Structure

### `jobs-api.service.ts` - Jobs API Service

- **Purpose**: Handles job-related API operations
- **Responsibilities**:
  - Job creation and validation
  - Job retrieval with pagination and filtering
  - Job cancellation and status management
  - Job statistics and reporting
- **Dependencies**: JobQueueService, Supabase client

### `trips-api.service.ts` - Trips API Service

- **Purpose**: Handles trip-related API operations
- **Responsibilities**:
  - Trip CRUD operations
  - Trip search and filtering
  - Trip generation and processing
  - Trip statistics and analytics
- **Dependencies**: TripService, Supabase client

### `users-api.service.ts` - Users API Service

- **Purpose**: Handles user-related API operations
- **Responsibilities**:
  - User profile management
  - User preferences and settings
  - User search and administration
  - User statistics and activity
- **Dependencies**: UserService, Supabase client

### `auth-api.service.ts` - Authentication API Service

- **Purpose**: Handles authentication-related API operations
- **Responsibilities**:
  - User registration and login
  - Two-factor authentication
  - Password management
  - Session management
- **Dependencies**: AuthService, Supabase client

## 🔧 Service Patterns

### Service Interface Pattern

All API services follow a consistent interface pattern:

```typescript
export interface ApiServiceConfig {
	supabase: SupabaseClient;
}

export class ExampleApiService {
	private supabase: SupabaseClient;

	constructor(config: ApiServiceConfig) {
		this.supabase = config.supabase;
	}

	// Business logic methods
	async getResource(id: string, userId: string): Promise<Resource> {
		// Implementation
	}

	async createResource(data: CreateResourceRequest, userId: string): Promise<CreateResourceResult> {
		// Implementation
	}

	// Validation methods
	validateCreateRequest(request: CreateResourceRequest): void {
		// Validation logic
	}
}
```

### Error Handling Pattern

All services use the centralized error handler:

```typescript
import { errorHandler, ErrorCode } from '../error-handler.service';

// In service methods
try {
	// Business logic
} catch (error) {
	throw errorHandler.createError(ErrorCode.DATABASE_ERROR, 'Failed to fetch resource', 500, error, {
		userId,
		resourceId
	});
}
```

### Validation Pattern

Services include validation methods for request data:

```typescript
validateCreateRequest(request: CreateRequest): void {
  const { field1, field2 } = request;

  if (!field1) {
    throw errorHandler.createError(
      ErrorCode.MISSING_REQUIRED_FIELD,
      'Field1 is required',
      400,
      { field: 'field1' }
    );
  }

  // Additional validation logic
}
```

## 🚀 Usage Examples

### Jobs API Service

```typescript
// Initialize service
const jobsApiService = new JobsApiService({ supabase });

// Get jobs with pagination
const result = await jobsApiService.getJobs(
	userId,
	{
		page: 1,
		limit: 20,
		status: 'completed'
	},
	isAdmin
);

// Create job
const jobResult = await jobsApiService.createJob(userId, {
	type: 'trip_generation',
	data: { startDate: '2024-01-01' },
	priority: 'normal'
});
```

### Trips API Service

```typescript
// Initialize service
const tripsApiService = new TripsApiService({ supabase });

// Get trips with filtering
const trips = await tripsApiService.getTrips(userId, {
	page: 1,
	limit: 10,
	status: 'approved',
	search: 'vacation'
});

// Create trip
const trip = await tripsApiService.createTrip(userId, {
	title: 'Summer Vacation',
	start_date: '2024-07-01',
	end_date: '2024-07-15'
});
```

## 🧪 Testing

### Service Testing Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobsApiService } from './jobs-api.service';

describe('JobsApiService', () => {
	let service: JobsApiService;
	let mockSupabase: any;

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			single: vi.fn()
		};

		service = new JobsApiService({ supabase: mockSupabase });
	});

	it('should get jobs for user', async () => {
		const mockJobs = [{ id: '1', type: 'trip_generation' }];
		mockSupabase.single.mockResolvedValue({ data: mockJobs, error: null });

		const result = await service.getJobs('user123', { page: 1, limit: 10 });

		expect(result.jobs).toEqual(mockJobs);
	});
});
```

### API Route Testing Pattern

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GET, POST } from './+server';

describe('Jobs API', () => {
	it('should return jobs for authenticated user', async () => {
		const mockEvent = {
			locals: {
				getSession: vi.fn().mockResolvedValue({ user: { id: '123' } }),
				supabase: mockSupabase
			},
			url: new URL('http://localhost/api/v1/jobs')
		};

		const response = await GET(mockEvent as any);
		const data = await response.json();

		expect(data.success).toBe(true);
		expect(data.data.jobs).toBeDefined();
	});
});
```

## 🔄 Migration Guide

### From Direct API Logic

```typescript
// ❌ Old way - Direct API logic
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.getSession();
		if (!session?.user) {
			return errorResponse('Unauthorized', 401);
		}

		const { data: jobs, error } = await locals.supabase
			.from('jobs')
			.select('*')
			.eq('created_by', session.user.id);

		if (error) throw error;
		return successResponse(jobs);
	} catch (error) {
		return errorResponse(error);
	}
};

// ✅ New way - Service layer
export const GET: RequestHandler = createGetHandler(
	async (context) => {
		const { user } = context;
		const result = await jobsApiService.getJobs(user!.id, {});
		return result;
	},
	{ requireAuthentication: true }
);
```

### From Manual Validation

```typescript
// ❌ Old way - Manual validation
if (!type || !data) {
	return validationErrorResponse('Type and data are required');
}

// ✅ New way - Schema validation
export const POST: RequestHandler = createPostHandler(
	async (context) => {
		const { body } = context;
		// body is already validated by Zod schema
		return await jobsApiService.createJob(userId, body);
	},
	{ validateBody: createJobSchema }
);
```

## 📊 Benefits

### 1. Separation of Concerns

- **API Routes**: Handle HTTP concerns (authentication, validation, response formatting)
- **API Services**: Handle business logic and data operations
- **Core Services**: Handle domain-specific operations

### 2. Testability

- Services can be unit tested independently
- Mock dependencies easily
- Test business logic without HTTP overhead

### 3. Reusability

- Services can be used by multiple API endpoints
- Services can be used by background workers
- Services can be used by CLI tools

### 4. Consistency

- Standardized error handling
- Standardized validation patterns
- Standardized response formats

### 5. Maintainability

- Clear separation of responsibilities
- Easy to modify business logic
- Easy to add new features

## 🔮 Future Enhancements

### 1. Service Composition

```typescript
// Combine multiple services for complex operations
async function createTripWithJobs(userId: string, tripData: TripRequest) {
	const trip = await tripsApiService.createTrip(userId, tripData);
	const job = await jobsApiService.createJob(userId, {
		type: 'trip_generation',
		data: { tripId: trip.id }
	});
	return { trip, job };
}
```

### 2. Caching Layer

```typescript
// Add caching to frequently accessed data
class CachedJobsApiService extends JobsApiService {
	private cache = new Map();

	async getJobs(userId: string, query: JobQuery): Promise<GetJobsResult> {
		const cacheKey = `${userId}-${JSON.stringify(query)}`;
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey);
		}

		const result = await super.getJobs(userId, query);
		this.cache.set(cacheKey, result);
		return result;
	}
}
```

### 3. Event-Driven Architecture

```typescript
// Emit events for important operations
class EventDrivenJobsApiService extends JobsApiService {
	async createJob(userId: string, request: CreateJobRequest): Promise<CreateJobResult> {
		const result = await super.createJob(userId, request);

		// Emit event for job creation
		this.eventEmitter.emit('job.created', {
			jobId: result.job.id,
			userId,
			type: request.type
		});

		return result;
	}
}
```

This API service layer provides a solid foundation for scalable, maintainable, and testable API development.
