import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorHandler } from '../../lib/services/error-handler.service';
import { loggingService } from '../../lib/services/logging.service';
import { queryOptimizer } from '../../lib/services/database/query-optimizer.service';

describe('Error Handler Service', () => {
  describe('createError', () => {
    it('should create validation errors', () => {
      const error = errorHandler.createError(
        'VALIDATION_ERROR',
        'Validation failed',
        400
      );

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed');
      expect(error.isOperational).toBe(true);
    });

    it('should create authentication errors', () => {
      const error = errorHandler.createError(
        'AUTHENTICATION_FAILED',
        'Authentication required',
        401
      );

      expect(error.code).toBe('AUTHENTICATION_FAILED');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Authentication required');
      expect(error.isOperational).toBe(true);
    });

    it('should create authorization errors', () => {
      const error = errorHandler.createError(
        'INSUFFICIENT_PERMISSIONS',
        'Insufficient permissions',
        403
      );

      expect(error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Insufficient permissions');
      expect(error.isOperational).toBe(true);
    });

    it('should create not found errors', () => {
      const error = errorHandler.createError(
        'RECORD_NOT_FOUND',
        'Resource not found',
        404
      );

      expect(error.code).toBe('RECORD_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
      expect(error.isOperational).toBe(true);
    });

    it('should create rate limit errors', () => {
      const error = errorHandler.createError(
        'RATE_LIMIT_EXCEEDED',
        'Rate limit exceeded',
        429
      );

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.isOperational).toBe(true);
    });

    it('should create database errors', () => {
      const error = errorHandler.createError(
        'DATABASE_ERROR',
        'Database connection failed',
        500
      );

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Database connection failed');
      expect(error.isOperational).toBe(false);
    });

    it('should create unknown errors', () => {
      const error = errorHandler.createError(
        'INTERNAL_SERVER_ERROR',
        'Unknown error occurred',
        500
      );

      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Unknown error occurred');
      expect(error.isOperational).toBe(false);
    });
  });

  describe('createErrorResponse', () => {
    it('should create a proper error response', () => {
      const error = errorHandler.createError('VALIDATION_ERROR', 'Test error', 400);
      const response = errorHandler.createErrorResponse(error);

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should include error details in response', async () => {
      const error = errorHandler.createError('VALIDATION_ERROR', 'Test error', 400);
      const response = errorHandler.createErrorResponse(error);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toBe('Test error');
    });

    it('should include additional details when requested', async () => {
      const error = errorHandler.createError(
        'VALIDATION_ERROR',
        'Test error',
        400,
        { field: 'email', value: 'invalid' }
      );
      const response = errorHandler.createErrorResponse(error, true);
      const data = await response.json();

      expect(data.error.details).toBeDefined();
      expect(data.error.details.field).toBe('email');
    });
  });
});

describe('Logging Service', () => {
  beforeEach(() => {
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('log', () => {
    it('should log info messages', () => {
      loggingService.log('info', 'Test info message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Test info message')
      );
    });

    it('should log warning messages', () => {
      loggingService.log('warn', 'Test warning message');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Test warning message')
      );
    });

    it('should log error messages', () => {
      loggingService.log('error', 'Test error message');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
    });

    it('should include metadata in log messages', () => {
      const metadata = { userId: '123', action: 'test' };
      loggingService.log('info', 'Test message', metadata);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Test message'),
        expect.objectContaining(metadata)
      );
    });
  });

  describe('info', () => {
    it('should log info level messages', () => {
      loggingService.info('Test info message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Test info message')
      );
    });
  });

  describe('warn', () => {
    it('should log warning level messages', () => {
      loggingService.warn('Test warning message');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Test warning message')
      );
    });
  });

  describe('error', () => {
    it('should log error level messages', () => {
      loggingService.error('Test error message');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
    });
  });

  describe('debug', () => {
    it('should log debug messages in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      loggingService.debug('Test debug message');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should not log debug messages in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      loggingService.debug('Test debug message');

      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );

      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe('Query Optimizer Service', () => {
  describe('optimizeQuery', () => {
    it('should add pagination to queries', () => {
      const query = { table: 'users', select: '*' };
      const optimized = queryOptimizer.optimizeQuery(query, { page: 1, limit: 10 });

      expect(optimized).toHaveProperty('range');
      expect(optimized.range).toBe('0-9');
    });

    it('should add sorting to queries', () => {
      const query = { table: 'users', select: '*' };
      const optimized = queryOptimizer.optimizeQuery(query, { sortBy: 'created_at', sortOrder: 'desc' });

      expect(optimized).toHaveProperty('order');
      expect(optimized.order).toBe('created_at.desc');
    });

    it('should add filtering to queries', () => {
      const query = { table: 'users', select: '*' };
      const optimized = queryOptimizer.optimizeQuery(query, {
        filters: { status: 'active', role: 'user' }
      });

      expect(optimized).toHaveProperty('eq');
      expect(optimized.eq).toEqual({ status: 'active', role: 'user' });
    });

    it('should combine multiple optimizations', () => {
      const query = { table: 'users', select: '*' };
      const optimized = queryOptimizer.optimizeQuery(query, {
        page: 1,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'desc',
        filters: { status: 'active' }
      });

      expect(optimized).toHaveProperty('range');
      expect(optimized).toHaveProperty('order');
      expect(optimized).toHaveProperty('eq');
    });
  });

  describe('getCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const query = { table: 'users', select: '*' };
      const options = { page: 1, limit: 10 };

      const key1 = queryOptimizer.getCacheKey(query, options);
      const key2 = queryOptimizer.getCacheKey(query, options);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different queries', () => {
      const query1 = { table: 'users', select: '*' };
      const query2 = { table: 'trips', select: '*' };
      const options = { page: 1, limit: 10 };

      const key1 = queryOptimizer.getCacheKey(query1, options);
      const key2 = queryOptimizer.getCacheKey(query2, options);

      expect(key1).not.toBe(key2);
    });
  });

  describe('shouldCache', () => {
    it('should cache read operations', () => {
      const query = { table: 'users', select: '*' };
      expect(queryOptimizer.shouldCache(query)).toBe(true);
    });

    it('should not cache write operations', () => {
      const query = { table: 'users', insert: { name: 'test' } };
      expect(queryOptimizer.shouldCache(query)).toBe(false);
    });

    it('should not cache delete operations', () => {
      const query = { table: 'users', delete: true };
      expect(queryOptimizer.shouldCache(query)).toBe(false);
    });
  });

  describe('getIndexRecommendations', () => {
    it('should recommend indexes for slow queries', () => {
      const slowQuery = {
        table: 'users',
        select: '*',
        eq: { status: 'active', role: 'user' },
        order: 'created_at.desc'
      };

      const recommendations = queryOptimizer.getIndexRecommendations(slowQuery);

      expect(recommendations).toContain('CREATE INDEX ON users(status, role)');
      expect(recommendations).toContain('CREATE INDEX ON users(created_at DESC)');
    });

    it('should recommend composite indexes for complex queries', () => {
      const complexQuery = {
        table: 'trips',
        select: '*',
        eq: { user_id: '123', status: 'active' },
        gte: { start_date: '2024-01-01' },
        lte: { end_date: '2024-12-31' }
      };

      const recommendations = queryOptimizer.getIndexRecommendations(complexQuery);

      expect(recommendations).toContain('CREATE INDEX ON trips(user_id, status, start_date, end_date)');
    });
  });
});