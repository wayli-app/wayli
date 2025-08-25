import { z } from 'zod';

import { errorResponse, validationErrorResponse } from '$lib/utils/api/response';

import type { RequestHandler } from '@sveltejs/kit';

// Type for validated request context
export interface ValidatedRequestContext<T> {
	validatedData: T;
	request: Request;
	url: URL;
	params: Partial<Record<string, string>>;
	cookies: unknown;
	fetch: typeof fetch;
	locals: unknown;
	platform: unknown;
}

// Type for validated query params context
export interface ValidatedQueryContext<T> {
	validatedParams: T;
	url: URL;
	params: Partial<Record<string, string>>;
	cookies: unknown;
	fetch: typeof fetch;
	locals: unknown;
	platform: unknown;
}

// Type for validated path params context
export interface ValidatedPathContext<T> {
	validatedParams: T;
	url: URL;
	params: T;
	cookies: unknown;
	fetch: typeof fetch;
	locals: unknown;
	platform: unknown;
}

/**
 * Validates request body and returns a Response if validation fails
 * Otherwise, calls the handler with validated data
 */
export function withBodyValidation<T>(
	schema: z.ZodSchema<T>,
	handler: (context: ValidatedRequestContext<T>) => Promise<Response>
): RequestHandler {
	return async (context) => {
		try {
			let data: unknown;

			// Handle different content types
			const contentType = context.request.headers.get('content-type');

			if (contentType?.includes('application/json')) {
				data = await context.request.json();
			} else if (contentType?.includes('multipart/form-data')) {
				const formData = await context.request.formData();
				data = Object.fromEntries(formData.entries());
			} else if (contentType?.includes('application/x-www-form-urlencoded')) {
				const text = await context.request.text();
				const params = new URLSearchParams(text);
				data = Object.fromEntries(params.entries());
			} else {
				// For GET requests or other cases, try to parse as JSON
				try {
					data = await context.request.json();
				} catch {
					data = {};
				}
			}

			// Validate the data
			const validatedData = schema.parse(data);

			// Create validated context
			const validatedContext: ValidatedRequestContext<T> = {
				validatedData,
				...context
			};

			return handler(validatedContext);
		} catch (error) {
			if (error instanceof z.ZodError) {
				const zodError = error as z.ZodError<unknown>;
				const errorMessage = zodError.issues
					.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
					.join(', ');
				return validationErrorResponse(errorMessage);
			}
			return errorResponse('Validation failed', 400);
		}
	};
}

/**
 * Validates query parameters and returns a Response if validation fails
 * Otherwise, calls the handler with validated params
 */
export function withQueryValidation<T>(
	schema: z.ZodSchema<T>,
	handler: (context: ValidatedQueryContext<T>) => Promise<Response>
): RequestHandler {
	return async (context) => {
		try {
			const params = Object.fromEntries(context.url.searchParams.entries());
			const validatedParams = schema.parse(params);

			const validatedContext: ValidatedQueryContext<T> = {
				validatedParams,
				...context
			};

			return handler(validatedContext);
		} catch (error) {
			if (error instanceof z.ZodError) {
				const zodError = error as z.ZodError<unknown>;
				const errorMessage = zodError.issues
					.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
					.join(', ');
				return validationErrorResponse(errorMessage);
			}
			return errorResponse('Query parameter validation failed', 400);
		}
	};
}

/**
 * Validates path parameters and returns a Response if validation fails
 * Otherwise, calls the handler with validated params
 */
export function withPathValidation<T>(
	schema: z.ZodSchema<T>,
	handler: (context: ValidatedPathContext<T>) => Promise<Response>
): RequestHandler {
	return async (context) => {
		try {
			const validatedParams = schema.parse(context.params);

			const validatedContext: ValidatedPathContext<T> = {
				validatedParams,
				...context,
				params: validatedParams
			};

			return handler(validatedContext);
		} catch (error) {
			if (error instanceof z.ZodError) {
				const zodError = error as z.ZodError<unknown>;
				const errorMessage = zodError.issues
					.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
					.join(', ');
				return validationErrorResponse(errorMessage);
			}
			return errorResponse('Path parameter validation failed', 400);
		}
	};
}
