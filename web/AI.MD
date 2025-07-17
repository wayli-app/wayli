# AI.MD - Wayli Project Guidelines

## 🎯 Project Overview

Wayli is a privacy-first, open-source location tracking and trip management application built with SvelteKit and Supabase. This document provides comprehensive guidelines for AI-assisted development and project-specific practices.

## 🏗️ Architecture Patterns

### Service Layer Architecture

- **Location**: `src/lib/architecture/service-layer.ts`
- **Pattern**: Dependency injection with service container
- **Usage**: All business logic should be in service classes
- **Benefits**: Testability, reusability, separation of concerns

### Error Handling

- **Location**: `src/lib/services/error-handler.service.ts`
- **Pattern**: Centralized error handling with structured error codes
- **Usage**: Use `errorHandler.createError()` for all application errors
- **Benefits**: Consistent error responses, proper logging, debugging

### Validation

- **Location**: `src/lib/validation/schemas.ts`
- **Pattern**: Zod schemas for all data validation
- **Usage**: Use `validateWithSchema()` for API input validation
- **Benefits**: Type safety, clear error messages, API documentation

## 🔧 Development Guidelines

### File Organization

```
src/
├── lib/
│   ├── components/          # Reusable UI components
│   ├── services/           # Business logic services
│   ├── stores/             # Svelte stores
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── validation/         # Zod validation schemas
│   ├── middleware/         # Request middleware
│   └── core/               # Core configuration
├── routes/
│   ├── (user)/             # Protected user routes
│   ├── api/                # API endpoints
│   └── setup/              # Initial setup flow
└── static/                 # Static assets
```

### Naming Conventions

- **Files**: kebab-case (e.g., `user-profile.service.ts`)
- **Components**: PascalCase (e.g., `UserProfile.svelte`)
- **Services**: PascalCase with Service suffix (e.g., `UserProfileService`)
- **Types**: PascalCase (e.g., `UserProfile`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_ATTEMPTS`)

### Code Style

- Use TypeScript strict mode
- Prefer functional components over class-based
- Use async/await for all asynchronous operations
- Handle errors gracefully with try/catch blocks
- Add JSDoc comments for complex functions
- Use descriptive variable and function names

## 🛡️ Security Practices

### Authentication & Authorization

- Always validate user authentication in protected routes
- Use RLS policies for database access control
- Implement proper session management
- Use environment variables for sensitive configuration

### Input Validation

- Validate all user input with Zod schemas
- Sanitize data before database operations
- Use parameterized queries to prevent SQL injection
- Implement rate limiting for API endpoints

### Error Handling

- Never expose sensitive information in error messages
- Log errors with appropriate context
- Use structured error codes for consistent handling
- Implement graceful degradation for failures

## 🚀 Performance Guidelines

### Database Optimization

- Use proper indexing for frequently queried columns
- Implement caching for expensive operations
- Use query batching for multiple operations
- Monitor query performance and optimize slow queries

### Frontend Optimization

- Implement code splitting and lazy loading
- Use proper caching strategies
- Optimize bundle size with tree shaking
- Implement proper loading states

### Caching Strategy

- **Location**: `src/lib/architecture/service-layer.ts` (EnhancedCacheService)
- **Pattern**: In-memory caching with TTL and LRU eviction
- **Usage**: Use service container to access cache service
- **Benefits**: Reduced database load, faster responses

## 🧪 Testing Strategy

### Test Structure

```
tests/
├── unit/                   # Unit tests for services and utilities
├── integration/            # Integration tests for API endpoints
├── accessibility/          # Accessibility tests
└── setup.ts               # Test setup and utilities
```

### Testing Guidelines

- Write tests for critical functionality
- Use descriptive test names
- Test both success and error scenarios
- Mock external dependencies appropriately
- Aim for 80%+ code coverage

### Test Utilities

- **Location**: `tests/setup.ts`
- **Features**: Mock data generators, service mocks, cleanup utilities
- **Usage**: Import and use in test files
- **Benefits**: Consistent test setup, reusable test utilities

## 📊 Monitoring & Logging

### Logging Service

- **Location**: `src/lib/services/logging.service.ts`
- **Pattern**: Structured logging with multiple outputs
- **Usage**: Use `loggingService.log()` for all application logging
- **Benefits**: Centralized logging, multiple output formats, structured data

### Error Tracking

- **Location**: `src/lib/services/error-handler.service.ts`
- **Pattern**: Centralized error handling with database logging
- **Usage**: Use `errorHandler.handleApiError()` for API error handling
- **Benefits**: Consistent error responses, proper logging, debugging

## 🔄 Background Job Processing

### Job Queue System

- **Location**: `src/lib/services/queue/`
- **Pattern**: Configurable worker system with real-time notifications
- **Usage**: Use `JobQueueService` for all background tasks
- **Benefits**: Scalable job processing, real-time updates, error handling

### Worker Management

- **Location**: `src/scripts/worker-manager.ts`
- **Pattern**: Dynamic worker scaling with health monitoring
- **Usage**: Configure workers via environment variables
- **Benefits**: Automatic scaling, health monitoring, graceful shutdown

## 🌐 API Design

### RESTful Conventions

- Use proper HTTP status codes
- Implement consistent response formats
- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Implement proper error handling

### Response Format

```typescript
interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: {
		message: string;
		code: string;
		details?: unknown;
	};
	meta?: {
		timestamp: string;
		pagination?: {
			page: number;
			limit: number;
			total: number;
			totalPages: number;
			hasNext: boolean;
			hasPrev: boolean;
		};
	};
}
```

## 🎨 UI/UX Guidelines

### Component Architecture

- Use composition over inheritance
- Implement proper loading states
- Use consistent design tokens
- Support both light and dark themes

### Accessibility

- Follow WCAG 2.1 AA guidelines
- Use semantic HTML elements
- Implement proper ARIA labels
- Ensure keyboard navigation
- Test with screen readers

### Responsive Design

- Mobile-first approach
- Use Tailwind CSS responsive utilities
- Test on multiple screen sizes
- Optimize for touch interactions

## 🔧 Environment Configuration

### Supabase Clients

- **Client**: `src/lib/core/supabase/client.ts` - Browser/client-side
- **Server**: `src/lib/core/supabase/server.ts` - SvelteKit server-side
- **Worker**: `src/lib/core/supabase/worker.ts` - Background workers

### Environment Variables

- **Public**: `$env/static/public` - Client-side public variables
- **Private**: `$env/static/private` - Server-side private variables
- **Node.js**: `process.env` - Node.js/worker environments

## 📚 Documentation Standards

### Code Documentation

- Add JSDoc comments for all public functions
- Document complex business logic
- Include usage examples in comments
- Keep documentation up to date

### API Documentation

- Document all API endpoints
- Include request/response examples
- Document error codes and messages
- Keep API documentation current

### Project Documentation

- Keep README.md updated
- Maintain CHANGELOG.md for significant changes
- Document setup and deployment procedures
- Include troubleshooting guides

## 🚀 Deployment Guidelines

### Production Checklist

- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Error tracking configured
- [ ] Performance monitoring enabled

### Environment-Specific Configuration

- Use environment-specific configuration files
- Validate configuration on startup
- Use proper secrets management
- Implement health checks

## 🔍 Code Review Guidelines

### Review Checklist

- [ ] Code follows project conventions
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Accessibility requirements met

### Review Process

- All changes require code review
- Address feedback promptly
- Ensure CI/CD pipeline passes
- Update documentation as needed

## 📈 Performance Monitoring

### Key Metrics

- Database query performance
- API response times
- Bundle size and loading times
- Error rates and types
- User engagement metrics

### Monitoring Tools

- Application performance monitoring
- Error tracking and alerting
- Database performance monitoring
- User analytics and feedback

## 🔄 Continuous Improvement

### Regular Reviews

- Monthly architecture reviews
- Quarterly performance audits
- Security vulnerability assessments
- Accessibility compliance checks

### Feedback Integration

- User feedback collection
- Performance monitoring data
- Error tracking insights
- Team development velocity

---

_This document should be updated regularly to reflect current project practices and guidelines._
