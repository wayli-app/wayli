import type { AppError } from '$lib/utils/errors/error-handler';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export function successResponse<T>(
  data: T,
  status: number = 200,
  meta?: Record<string, unknown>
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };

  return json(response, { status });
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'statusCode' in error
  );
}

export function errorResponse(
  error: unknown,
  status?: number,
  meta?: Record<string, unknown>
): Response {
  let appError: AppError | Error;
  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof Error) {
    appError = error;
  } else if (typeof error === 'string') {
    appError = new Error(error);
  } else {
    appError = new Error('Unknown error');
  }

  const response: ApiResponse = {
    success: false,
    error: {
      message: appError.message,
      code: 'code' in appError ? (appError as AppError).code : 'UNKNOWN_ERROR',
      details: 'context' in appError ? (appError as AppError).context : undefined
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };

  const statusCode = status || ('statusCode' in appError ? (appError as AppError).statusCode : 500);
  return json(response, { status: statusCode });
}

export function validationErrorResponse(
  message: string,
  details?: Record<string, unknown>
): Response {
  return errorResponse(
    {
      message,
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      isOperational: true,
      context: details
    },
    400
  );
}

export function notFoundResponse(message: string = 'Resource not found'): Response {
  return errorResponse(
    {
      message,
      code: 'NOT_FOUND_ERROR',
      statusCode: 404,
      isOperational: true
    },
    404
  );
}

export function conflictResponse(message: string, details?: Record<string, unknown>): Response {
  return errorResponse(
    {
      message,
      code: 'CONFLICT_ERROR',
      statusCode: 409,
      isOperational: true,
      context: details
    },
    409
  );
}

export function serverErrorResponse(
  message: string = 'Internal server error',
  details?: Record<string, unknown>
): Response {
  return errorResponse(
    {
      message,
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: 500,
      isOperational: false,
      context: details
    },
    500
  );
}

import { json } from '@sveltejs/kit';
