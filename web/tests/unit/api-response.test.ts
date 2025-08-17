// src/tests/unit/api-response.test.ts
// Tests for API response utilities

import { describe, it, expect } from 'vitest';

import {
	successResponse,
	errorResponse,
	validationErrorResponse,
	notFoundResponse,
	conflictResponse,
	serverErrorResponse
} from '$lib/utils/api/response';

describe('API Response Utilities', () => {
	describe('successResponse', () => {
		it('should create a successful response with default status', async () => {
			const data = { message: 'Success' };
			const response = successResponse(data);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({
				success: true,
				data: { message: 'Success' },
				meta: {
					timestamp: expect.any(String)
				}
			});
		});

		it('should create a successful response with custom status', async () => {
			const data = { id: 123 };
			const response = successResponse(data, 201);

			expect(response.status).toBe(201);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(body.data).toEqual({ id: 123 });
		});

		it('should include custom metadata', async () => {
			const data = { result: 'ok' };
			const meta = { requestId: 'req-123', version: '1.0' };
			const response = successResponse(data, 200, meta);

			const body = await response.json();
			expect(body.meta).toEqual({
				timestamp: expect.any(String),
				requestId: 'req-123',
				version: '1.0'
			});
		});
	});

	describe('errorResponse', () => {
		it('should handle Error objects', async () => {
			const error = new Error('Something went wrong');
			const response = errorResponse(error);

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: {
					message: 'Something went wrong',
					code: 'UNKNOWN_ERROR'
				},
				meta: {
					timestamp: expect.any(String)
				}
			});
		});

		it('should handle string errors', async () => {
			const response = errorResponse('Custom error message');

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.message).toBe('Custom error message');
		});

		it('should handle custom status codes', async () => {
			const error = new Error('Not found');
			const response = errorResponse(error, 404);

			expect(response.status).toBe(404);
		});

		it('should handle AppError objects with custom properties', async () => {
			const appError = {
				message: 'Validation failed',
				code: 'VALIDATION_ERROR',
				statusCode: 400,
				isOperational: true,
				context: { field: 'email' }
			};
			const response = errorResponse(appError);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toEqual({
				message: 'Validation failed',
				code: 'VALIDATION_ERROR',
				details: { field: 'email' }
			});
		});

		it('should handle unknown error types', async () => {
			const response = errorResponse(null);

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.message).toBe('Unknown error');
		});
	});

	describe('validationErrorResponse', () => {
		it('should create validation error response', async () => {
			const response = validationErrorResponse('Invalid input');

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body).toEqual({
				success: false,
				error: {
					message: 'Invalid input',
					code: 'VALIDATION_ERROR',
					details: undefined
				},
				meta: {
					timestamp: expect.any(String)
				}
			});
		});

		it('should include validation details', async () => {
			const details = { field: 'email', value: 'invalid-email' };
			const response = validationErrorResponse('Invalid email', details);

			const body = await response.json();
			expect(body.error.details).toEqual(details);
		});
	});

	describe('notFoundResponse', () => {
		it('should create not found response with default message', async () => {
			const response = notFoundResponse();

			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body.error.message).toBe('Resource not found');
		});

		it('should create not found response with custom message', async () => {
			const response = notFoundResponse('User not found');

			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body.error.message).toBe('User not found');
		});
	});

	describe('conflictResponse', () => {
		it('should create conflict response', async () => {
			const response = conflictResponse('Email already exists');

			expect(response.status).toBe(409);
			const body = await response.json();
			expect(body.error.message).toBe('Email already exists');
		});

		it('should include conflict details', async () => {
			const details = { existingId: 123 };
			const response = conflictResponse('Duplicate resource', details);

			const body = await response.json();
			expect(body.error.details).toEqual(details);
		});
	});

	describe('serverErrorResponse', () => {
		it('should create server error response with default message', async () => {
			const response = serverErrorResponse();

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.message).toBe('Internal server error');
		});

		it('should create server error response with custom message', async () => {
			const response = serverErrorResponse('Database connection failed');

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.message).toBe('Database connection failed');
		});

		it('should include error details', async () => {
			const details = { errorCode: 'DB_CONN_001' };
			const response = serverErrorResponse('Database error', details);

			const body = await response.json();
			expect(body.error.details).toEqual(details);
		});
	});

	describe('Response Structure', () => {
		it('should always include success flag', async () => {
			const successRes = successResponse({ data: 'test' });
			const errorRes = errorResponse('test error');

			const successBody = await successRes.json();
			const errorBody = await errorRes.json();

			expect(successBody.success).toBe(true);
			expect(errorBody.success).toBe(false);
		});

		it('should always include timestamp in meta', async () => {
			const response = successResponse({ data: 'test' });
			const body = await response.json();

			expect(body.meta.timestamp).toBeDefined();
			expect(new Date(body.meta.timestamp).getTime()).not.toBeNaN();
		});

		it('should have consistent error structure', async () => {
			const response = errorResponse('test error');
			const body = await response.json();

			expect(body.error).toHaveProperty('message');
			expect(body.error).toHaveProperty('code');
			expect(typeof body.error.message).toBe('string');
			expect(typeof body.error.code).toBe('string');
		});
	});
});
