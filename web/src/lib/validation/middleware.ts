import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { errorResponse, validationErrorResponse } from '$lib/utils/api/response';

export function validateRequest<T>(schema: z.ZodSchema<T>): RequestHandler {
  return async ({ request, ...rest }) => {
    try {
      let data: unknown;

      // Handle different content types
      const contentType = request.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        data = await request.json();
      } else if (contentType?.includes('multipart/form-data')) {
        const formData = await request.formData();
        data = Object.fromEntries(formData.entries());
      } else if (contentType?.includes('application/x-www-form-urlencoded')) {
        const text = await request.text();
        const params = new URLSearchParams(text);
        data = Object.fromEntries(params.entries());
      } else {
        // For GET requests or other cases, try to parse as JSON
        try {
          data = await request.json();
        } catch {
          data = {};
        }
      }

      // Validate the data
      const validatedData = schema.parse(data);

      // Create a new request with validated data
      const validatedRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(validatedData)
      });

      // Return the validated request and other context
      return { request: validatedRequest, ...rest, validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return validationErrorResponse(errorMessage);
      }
      return errorResponse('Validation failed', 400);
    }
  };
}

export function validateQueryParams<T>(schema: z.ZodSchema<T>): RequestHandler {
  return async ({ url, ...rest }) => {
    try {
      const params = Object.fromEntries(url.searchParams.entries());
      const validatedParams = schema.parse(params);

      return { url, ...rest, validatedParams };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return validationErrorResponse(errorMessage);
      }
      return errorResponse('Query parameter validation failed', 400);
    }
  };
}

export function validatePathParams<T>(schema: z.ZodSchema<T>): RequestHandler {
  return async ({ params, ...rest }) => {
    try {
      const validatedParams = schema.parse(params);
      return { params: validatedParams, ...rest };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return validationErrorResponse(errorMessage);
      }
      return errorResponse('Path parameter validation failed', 400);
    }
  };
}

// Helper function to create a validated API handler
export function createValidatedHandler<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, context: any) => Promise<Response>
): RequestHandler {
  return async (context) => {
    const validationResult = await validateRequest(schema)(context);

    if (validationResult instanceof Response) {
      return validationResult;
    }

    const { validatedData, ...rest } = validationResult;
    return handler(validatedData, rest);
  };
}