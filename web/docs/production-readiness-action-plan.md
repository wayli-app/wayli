# Production Readiness Action Plan

## Overview

This document provides a prioritized, step-by-step action plan to bring the Wayli codebase from **70-80% production-ready** to **95%+ production-ready**.

**Current Status**: B+ Grade (70-80% Ready)
**Target Status**: A Grade (95%+ Ready)
**Estimated Timeline**: 5-8 weeks

---

## Phase 1: Critical Blockers (Week 1-3)

### 1.1 TypeScript Compilation Errors ⚠️ CRITICAL

**Priority**: P0
**Estimated Time**: 2-3 weeks
**Current Status**: ~73 errors remaining

#### Fixed Issues (✅ Completed):
- `hooks.ts`: Fixed implicit `any` type for request parameter
- `lib/components/index.ts`: Removed non-existent client directory export
- `lib/index.ts`: Removed non-existent client directory export
- `shared/index.ts`: Added type exports
- `services/api/index.ts`: Commented out missing statistics service
- `services/api/jobs-api.service.ts`: Fixed import path and added Job type annotations
- `services/export.service.ts`: Fixed import paths
- `services/export.service.worker.ts`: Added proper type definitions for job records
- `services/database/migration.service.ts`: Fixed unknown error type handling
- `services/want-to-visit.service.ts`: Started adding DbPlace type definitions

#### Remaining Issues:

**1. Paraglide Messages (Low Impact)**
```typescript
// src/lib/paraglide/messages/en.js and nl.js
// Issue: Not recognized as modules
// Solution: Add module exports or create .d.ts files
```

**2. Want-to-Visit Service Type Issues**
```typescript
// src/lib/services/want-to-visit.service.ts
// Issue: Supabase inferring 'never' types
// Solution: Add explicit type annotations for all database operations
//

 Lines to fix: 22-24, 42, 65-67, 77, 100-102, 124, 136-138
```

**3. Job Store Type Issues**
```typescript
// src/lib/stores/job-store.ts:139
// Issue: Property 'id' does not exist on type 'never'
// Solution: Add proper type for Supabase realtime payload
```

#### Action Steps:

1. **Create shared database types** (1 day)
   ```bash
   # Create file: src/lib/types/database.types.ts
   # Define interfaces for all database tables
   ```

2. **Fix want-to-visit.service.ts** (2 hours)
   - Add DbPlace type for all database operations
   - Apply type assertions consistently
   - Test all CRUD operations

3. **Fix job-store.ts** (1 hour)
   - Add proper realtime payload types
   - Test realtime subscriptions

4. **Add .d.ts files for JavaScript modules** (1 hour)
   - Create type declarations for paraglide messages
   - Create type declarations for any other JS files

5. **Re-run type check and verify** (30 min)
   ```bash
   npx tsc --noEmit
   ```

### 1.2 Console.log Cleanup 🔧 CRITICAL

**Priority**: P0
**Estimated Time**: 3-4 days
**Current Status**: 965 occurrences across 93 files

#### Strategy:

1. **Replace development logs with proper logging service** (2 days)
   ```typescript
   // Before:
   console.log('Processing job:', jobId);

   // After:
   logger.info('Processing job', { jobId });
   ```

2. **Remove debug console.logs** (1 day)
   ```bash
   # Find all console.log statements
   grep -r "console.log" src/ --exclude-dir=node_modules

   # Remove debugging statements
   # Keep only error console.logs in catch blocks (temporarily)
   ```

3. **Add environment-based logging** (1 day)
   ```typescript
   // src/lib/services/logging.service.ts (enhance existing)
   export const logger = {
     debug: (message: string, context?: Record<string, unknown>) => {
       if (isDevelopment) {
         console.debug(message, context);
       }
     },
     info: (message: string, context?: Record<string, unknown>) => {
       // Send to logging service in production
     },
     warn: (message: string, context?: Record<string, unknown>) => {
       // Send to logging service
     },
     error: (message: string, error?: Error, context?: Record<string, unknown>) => {
       // Send to error tracking service (Sentry, etc.)
     }
   };
   ```

#### Files to Update (Priority Order):

**High Priority** (Production code):
- `web/src/worker/*` - 19 files
- `web/src/lib/services/*` - 25 files
- `web/src/lib/components/*` - 10 files

**Medium Priority** (Routes & UI):
- `web/src/routes/**/*.svelte` - 20 files

**Low Priority** (Development/Test):
- `web/src/lib/utils/*` - Keep some for debugging
- Test files - Can keep console.logs

### 1.3 Test Coverage Setup 🧪 CRITICAL

**Priority**: P0
**Estimated Time**: 2 days

#### Action Steps:

1. **Configure Vitest Coverage** (2 hours)
   ```typescript
   // vite.config.ts
   import { defineConfig } from 'vite';

   export default defineConfig({
     test: {
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html', 'lcov'],
         exclude: [
           'node_modules/',
           'tests/',
           '**/*.test.ts',
           '**/*.spec.ts',
           '**/types/**',
           '**/*.d.ts'
         ],
         lines: 70,
         functions: 70,
         branches: 70,
         statements: 70
       }
     }
   });
   ```

2. **Add coverage scripts** (30 min)
   ```json
   // package.json
   {
     "scripts": {
       "test:coverage": "vitest run --coverage",
       "test:coverage:watch": "vitest watch --coverage",
       "test:coverage:ui": "vitest --ui --coverage"
     }
   }
   ```

3. **Set up CI coverage reporting** (1 hour)
   - Integrate with Codecov or Coveralls
   - Add coverage badge to README

4. **Run initial coverage report** (30 min)
   ```bash
   npm run test:coverage
   ```

---

## Phase 2: Quality Improvements (Week 3-5)

### 2.1 TypeScript Strict Mode 📘 HIGH

**Priority**: P1
**Estimated Time**: 3 days

#### Action Steps:

1. **Re-enable strict linting rules** (1 day)
   ```javascript
   // eslint.config.js
   export default ts.config(
     {
       rules: {
         '@typescript-eslint/no-explicit-any': 'error',
         '@typescript-eslint/no-unused-vars': ['error', {
           argsIgnorePattern: '^_',
           varsIgnorePattern: '^_'
         }],
         '@typescript-eslint/explicit-function-return-type': 'warn'
       }
     }
   );
   ```

2. **Fix all `any` types** (2 days)
   ```bash
   # Find all 'any' usages
   grep -r ": any" src/ --include="*.ts"

   # Replace with proper types
   ```

### 2.2 JSDoc Documentation 📚 HIGH

**Priority**: P1
**Estimated Time**: 1 week

#### Coverage Goals:
- All public service methods: 100%
- All exported functions: 100%
- Complex algorithms: 100%
- Utility functions: 80%

#### Template:
```typescript
/**
 * Brief description of what the function does
 *
 * @param paramName - Description of the parameter
 * @param optionalParam - Description (optional)
 * @returns Description of return value
 * @throws {ErrorType} Description of when error is thrown
 *
 * @example
 * ```typescript
 * const result = await functionName('value');
 * console.log(result);
 * ```
 */
export async function functionName(
  paramName: string,
  optionalParam?: number
): Promise<ReturnType> {
  // implementation
}
```

#### Priority Order:
1. **Services** (3 days) - 33 service files
   - Start with: error-handler.service.ts ✅ Already well-documented
   - Continue with: trip-detection.service.ts, transport-mode-detector.service.ts

2. **Utils** (2 days) - 20+ utility files
   - Focus on: transport-mode.ts, multi-point-speed.ts, speed-pattern-analysis.ts

3. **Rules** (1 day) - 7 rule files
   - Document all detection rules

4. **API Services** (1 day) - API layer

### 2.3 Integration & E2E Tests 🧪 HIGH

**Priority**: P1
**Estimated Time**: 1 week

#### Current State:
- 27 test files (mostly unit tests)
- Missing: Integration tests, E2E tests

#### Test Strategy:

**1. Integration Tests** (3 days)
```typescript
// tests/integration/job-processing.test.ts
describe('Job Processing Integration', () => {
  it('should process complete job lifecycle', async () => {
    // Create job
    const job = await JobQueueService.createJob('trip_detection', {...});

    // Process job
    await JobProcessor.processJob(job.id);

    // Verify results
    const result = await JobQueueService.getJob(job.id);
    expect(result.status).toBe('completed');
  });
});

// tests/integration/trip-detection.test.ts
// tests/integration/data-import-export.test.ts
// tests/integration/realtime-updates.test.ts
```

**2. E2E Tests with Playwright** (2 days)
```bash
npm install -D @playwright/test
```

```typescript
// tests/e2e/user-journey.spec.ts
import { test, expect } from '@playwright/test';

test('complete user journey', async ({ page }) => {
  // Sign up
  await page.goto('/auth/signup');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // Upload data
  await page.goto('/dashboard/import-export');
  await page.setInputFiles('input[type="file"]', 'test-data.gpx');
  await page.click('button:has-text("Import")');

  // Verify trip detection
  await page.waitForSelector('.trip-card');
  await expect(page.locator('.trip-card')).toHaveCount(1);
});
```

**3. API Contract Tests** (1 day)
```typescript
// tests/integration/api-contracts.test.ts
describe('API Contracts', () => {
  it('GET /api/jobs returns valid schema', async () => {
    const response = await fetch('/api/jobs');
    const data = await response.json();

    expect(data).toMatchSchema({
      type: 'object',
      properties: {
        jobs: { type: 'array' },
        pagination: { type: 'object' }
      }
    });
  });
});
```

**4. Performance Tests** (1 day)
```typescript
// tests/performance/benchmarks.test.ts
import { describe, it, expect } from 'vitest';

describe('Performance Benchmarks', () => {
  it('trip detection should process 1000 points in < 1s', async () => {
    const start = Date.now();
    await detectTrips(mockPoints1000);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
```

### 2.4 Security Hardening 🔒 HIGH

**Priority**: P1
**Estimated Time**: 3-4 days

#### 1. Rate Limiting (1 day)
```typescript
// src/lib/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts'
});
```

#### 2. Security Headers (1 day)
```typescript
// src/hooks.server.ts
export const handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );

  return response;
};
```

#### 3. Input Validation (1 day)
```typescript
// Enhance existing validation with Zod
import { z } from 'zod';

export const createJobSchema = z.object({
  type: z.enum(['trip_detection', 'geocoding', 'data_export']),
  data: z.record(z.unknown()),
  priority: z.enum(['low', 'normal', 'high']).optional()
}).strict();

// Validate all API inputs
export const validateRequest = <T>(schema: z.Schema<T>) => {
  return (data: unknown): T => {
    return schema.parse(data); // Throws if invalid
  };
};
```

#### 4. Security Audit Checklist (1 day)
- [ ] All environment variables properly secured
- [ ] No secrets in client-side code
- [ ] SQL injection prevention (using parameterized queries)
- [ ] XSS prevention (input sanitization)
- [ ] CSRF protection enabled
- [ ] Secure session management
- [ ] Password hashing (bcrypt/argon2)
- [ ] Rate limiting on all endpoints
- [ ] Security headers configured
- [ ] Input validation on all endpoints
- [ ] File upload validation
- [ ] Audit logging for sensitive operations

---

## Phase 3: Production Preparation (Week 6-8)

### 3.1 Performance Optimization ⚡ MEDIUM

**Priority**: P2
**Estimated Time**: 1 week

#### Implementation Checklist:

**1. Code Splitting** (2 days)
```typescript
// Implement lazy loading for routes
const Dashboard = lazy(() => import('./routes/dashboard/+page.svelte'));
const Statistics = lazy(() => import('./routes/statistics/+page.svelte'));
```

**2. Bundle Optimization** (1 day)
```bash
# Analyze current bundle
npm run build
npx vite-bundle-visualizer

# Target: < 500KB gzipped
```

**3. Database Query Optimization** (2 days)
- Review slow query log
- Add missing indexes
- Optimize N+1 queries
- Implement query caching

**4. Image Optimization** (1 day)
- Convert to WebP format
- Implement lazy loading
- Add responsive images

**5. Caching Strategy** (1 day)
```typescript
// Implement Redis/in-memory caching
export class CacheService {
  private static cache = new Map();

  static async get<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value;
    }

    const value = await factory();
    this.cache.set(key, { value, timestamp: Date.now() });
    return value;
  }
}
```

### 3.2 Monitoring & Observability 📊 MEDIUM

**Priority**: P2
**Estimated Time**: 3 days

**1. Error Tracking** (1 day)
```bash
npm install @sentry/sveltekit
```

```typescript
// src/hooks.server.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});
```

**2. Performance Monitoring** (1 day)
- Set up Sentry Performance Monitoring
- Track Core Web Vitals
- Monitor API response times

**3. Logging Infrastructure** (1 day)
- Set up structured logging
- Configure log aggregation (Datadog/LogRocket)
- Set up alerts for errors

### 3.3 Documentation 📖 MEDIUM

**Priority**: P2
**Estimated Time**: 3-4 days

**1. API Documentation** (2 days)
```typescript
// Generate OpenAPI/Swagger docs
// Document all endpoints with examples
```

**2. Deployment Guide** (1 day)
- Environment setup
- Database migrations
- Deployment steps
- Rollback procedures

**3. Architecture Documentation** (1 day)
- System architecture diagram
- Data flow diagrams
- Database schema documentation
- Decision records (ADRs)

---

## Phase 4: Pre-Production Validation (Week 8)

### 4.1 Load Testing

**Tools**: k6, Artillery, or Apache JMeter

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Spike to 200
    { duration: '5m', target: 200 }, // Stay at 200
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  let response = http.get('https://your-app.com/api/jobs');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

### 4.2 Security Penetration Testing

**Tools**: OWASP ZAP, Burp Suite

**Checklist**:
- [ ] SQL injection testing
- [ ] XSS vulnerability testing
- [ ] CSRF testing
- [ ] Authentication bypass attempts
- [ ] Authorization testing
- [ ] Rate limiting verification
- [ ] File upload vulnerabilities

### 4.3 Accessibility Audit

**Tools**: axe DevTools, Lighthouse, WAVE

**Checklist**:
- [ ] Keyboard navigation
- [ ] Screen reader compatibility
- [ ] Color contrast
- [ ] ARIA labels
- [ ] Focus management
- [ ] Error messages

---

## Tracking Progress

### Weekly Checkpoints

**Week 1**:
- [ ] Fix 50% of TypeScript errors
- [ ] Remove 50% of console.logs
- [ ] Set up test coverage

**Week 2**:
- [ ] Fix remaining TypeScript errors
- [ ] Complete console.log cleanup
- [ ] Add 10+ integration tests

**Week 3**:
- [ ] Re-enable strict TypeScript rules
- [ ] Complete JSDoc for all services
- [ ] Add 5+ E2E tests

**Week 4-5**:
- [ ] Complete security hardening
- [ ] Add remaining documentation
- [ ] Performance optimization

**Week 6-7**:
- [ ] Monitoring setup
- [ ] API documentation
- [ ] Deployment automation

**Week 8**:
- [ ] Load testing
- [ ] Security audit
- [ ] Final review

### Success Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| TypeScript Errors | 73 | 0 | 🔴 |
| Test Coverage | Unknown | 70%+ | 🔴 |
| Console.logs | 965 | 0 | 🔴 |
| JSDoc Coverage | ~10% | 80%+ | 🔴 |
| Security Score | B | A | 🟡 |
| Performance Score | B+ | A | 🟡 |

---

## Risk Management

### High Risk Items

1. **TypeScript Errors**: May uncover hidden bugs
   - **Mitigation**: Fix incrementally, test thoroughly

2. **Breaking Changes**: Refactoring may break existing features
   - **Mitigation**: Comprehensive test coverage before changes

3. **Performance Regression**: Optimizations may cause issues
   - **Mitigation**: Performance benchmarks, gradual rollout

### Dependencies

- Database migrations must be tested thoroughly
- Supabase schema changes require careful planning
- Third-party service integrations need fallbacks

---

## Post-Launch Plan

### Monitoring (First 30 Days)

- Daily error rate monitoring
- Performance metrics tracking
- User feedback collection
- Database performance monitoring

### Iteration Cycle

- Weekly bug fix releases
- Bi-weekly feature releases
- Monthly security audits
- Quarterly architecture reviews

---

## Resources Needed

### Tools
- Sentry (Error Tracking): $26/month
- Datadog/LogRocket (Logging): $15-100/month
- Codecov (Coverage): Free for open source

### Time Investment
- 1-2 developers full-time for 6-8 weeks
- QA testing: 1 person part-time (weeks 6-8)
- Code review: 2-4 hours/week

---

## Conclusion

This action plan provides a clear path from 70% to 95%+ production readiness. The key is to tackle critical blockers first (TypeScript errors, console.logs, tests) before moving to quality improvements and optimizations.

**Next Immediate Actions**:
1. Finish fixing TypeScript errors (continue from want-to-visit.service.ts)
2. Set up test coverage reporting
3. Start console.log cleanup campaign

**Success Criteria for Production Launch**:
- ✅ Zero TypeScript compilation errors
- ✅ 70%+ test coverage
- ✅ Zero console.log statements in production code
- ✅ All critical security issues resolved
- ✅ Performance benchmarks meet targets
- ✅ Comprehensive monitoring in place

---

**Document Version**: 1.0
**Last Updated**: 2025-10-02
**Owner**: Development Team
