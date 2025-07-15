import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEvent } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { GET, POST } from '../../../routes/api/v1/statistics/+server';
import { GET as getTrips } from '../../../routes/api/v1/trips/+server';
import { POST as createTrip } from '../../../routes/api/v1/trips/+server';
import { auditLogger } from '../../../lib/services/audit-logger.service';
import { rateLimitService } from '../../../lib/services/rate-limit.service';

// Mock external dependencies
vi.mock('../../../lib/services/audit-logger.service');
vi.mock('../../../lib/services/rate-limit.service');
vi.mock('../../../lib/core/supabase/client');

describe('API Integration Tests', () => {
  let mockRequestEvent: RequestEvent;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create a mock request event
    mockRequestEvent = createEvent({
      request: new Request('http://localhost:3000/api/v1/statistics'),
      params: {},
      route: { id: '/api/v1/statistics' },
      url: new URL('http://localhost:3000/api/v1/statistics'),
      locals: {
        supabase: {
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: { user: { id: 'test-user-id', email: 'test@example.com' } },
              error: null
            })
          }
        },
        getSession: vi.fn().mockResolvedValue({
          user: { id: 'test-user-id', email: 'test@example.com', user_metadata: { role: 'user' } }
        })
      }
    } as any);

    // Mock audit logger
    (auditLogger.logEvent as any).mockResolvedValue(undefined);
    (auditLogger.logDataAccess as any).mockResolvedValue(undefined);

    // Mock rate limit service
    (rateLimitService.checkRateLimit as any).mockReturnValue({ allowed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Statistics API', () => {
    it('should return statistics for authenticated user', async () => {
      const response = await GET(mockRequestEvent);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('totalDistance');
      expect(data.data).toHaveProperty('locationsVisited');
    });

    it('should handle authentication errors', async () => {
      // Mock authentication failure
      (mockRequestEvent.locals.getSession as any).mockResolvedValue(null);

      const response = await GET(mockRequestEvent);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should log data access events', async () => {
      await GET(mockRequestEvent);

      expect(auditLogger.logDataAccess).toHaveBeenCalledWith(
        'test-user-id',
        'view',
        'statistics',
        undefined,
        expect.any(Request),
        expect.any(Object)
      );
    });
  });

  describe('Trips API', () => {
    it('should return trips for authenticated user', async () => {
      const response = await getTrips(mockRequestEvent);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should create a new trip', async () => {
      const tripData = {
        title: 'Test Trip',
        description: 'A test trip',
        start_date: '2024-01-01',
        end_date: '2024-01-05'
      };

      const createEvent = createEvent({
        request: new Request('http://localhost:3000/api/v1/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tripData)
        }),
        params: {},
        route: { id: '/api/v1/trips' },
        url: new URL('http://localhost:3000/api/v1/trips'),
        locals: mockRequestEvent.locals
      } as any);

      const response = await createTrip(createEvent);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should validate trip data', async () => {
      const invalidTripData = {
        title: '', // Invalid: empty title
        start_date: 'invalid-date', // Invalid date format
        end_date: '2024-01-01'
      };

      const createEvent = createEvent({
        request: new Request('http://localhost:3000/api/v1/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidTripData)
        }),
        params: {},
        route: { id: '/api/v1/trips' },
        url: new URL('http://localhost:3000/api/v1/trips'),
        locals: mockRequestEvent.locals
      } as any);

      const response = await createTrip(createEvent);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Mock rate limit exceeded
      (rateLimitService.checkRateLimit as any).mockReturnValue({
        allowed: false,
        retryAfter: 60,
        message: 'Too many requests'
      });

      const response = await GET(mockRequestEvent);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Rate limit exceeded');
    });
  });

  describe('Audit Logging', () => {
    it('should log successful API calls', async () => {
      await GET(mockRequestEvent);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Request),
        expect.any(String)
      );
    });

    it('should log failed authentication attempts', async () => {
      (mockRequestEvent.locals.getSession as any).mockResolvedValue(null);

      await GET(mockRequestEvent);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        'api_access_denied',
        expect.any(String),
        'medium',
        expect.any(Object),
        expect.any(Request)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      (mockRequestEvent.locals.supabase as any).from = vi.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await GET(mockRequestEvent);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle validation errors', async () => {
      const invalidData = { invalid: 'data' };

      const createEvent = createEvent({
        request: new Request('http://localhost:3000/api/v1/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidData)
        }),
        params: {},
        route: { id: '/api/v1/trips' },
        url: new URL('http://localhost:3000/api/v1/trips'),
        locals: mockRequestEvent.locals
      } as any);

      const response = await createTrip(createEvent);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Validation failed');
    });
  });

  describe('Security', () => {
    it('should sanitize user input', async () => {
      const maliciousData = {
        title: '<script>alert("xss")</script>',
        description: 'javascript:alert("xss")',
        start_date: '2024-01-01',
        end_date: '2024-01-05'
      };

      const createEvent = createEvent({
        request: new Request('http://localhost:3000/api/v1/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(maliciousData)
        }),
        params: {},
        route: { id: '/api/v1/trips' },
        url: new URL('http://localhost:3000/api/v1/trips'),
        locals: mockRequestEvent.locals
      } as any);

      const response = await createTrip(createEvent);
      const data = await response.json();

      // Should still succeed but with sanitized data
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject requests with invalid content type', async () => {
      const createEvent = createEvent({
        request: new Request('http://localhost:3000/api/v1/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'invalid data'
        }),
        params: {},
        route: { id: '/api/v1/trips' },
        url: new URL('http://localhost:3000/api/v1/trips'),
        locals: mockRequestEvent.locals
      } as any);

      const response = await createTrip(createEvent);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Content-Type must be application/json');
    });
  });
});