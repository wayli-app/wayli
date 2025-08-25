// Re-export AppError from services to avoid duplication
export type { AppError } from '../../services/error-handler.service';
export { ErrorCode } from '../../services/error-handler.service';

export class BaseError extends Error implements AppError {
	public readonly code: ErrorCode;
	public readonly statusCode: number;
	public readonly isOperational: boolean;
	public readonly context?: Record<string, unknown>;
	public readonly details?: unknown;

	constructor(
		message: string,
		code: ErrorCode,
		statusCode: number = 500,
		isOperational: boolean = true,
		context?: Record<string, unknown>,
		details?: unknown
	) {
		super(message);
		this.code = code;
		this.statusCode = statusCode;
		this.isOperational = isOperational;
		this.context = context;
		this.details = details;

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, BaseError);
		}
	}
}

export class ValidationError extends BaseError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, ErrorCode.VALIDATION_ERROR, 400, true, context);
	}
}

export class AuthenticationError extends BaseError {
	constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
		super(message, ErrorCode.AUTHENTICATION_FAILED, 401, true, context);
	}
}

export class AuthorizationError extends BaseError {
	constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
		super(message, ErrorCode.INSUFFICIENT_PERMISSIONS, 403, true, context);
	}
}

export class NotFoundError extends BaseError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, ErrorCode.NOT_FOUND, 404, true, context);
	}
}

export class ConflictError extends BaseError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, ErrorCode.CONFLICT_ERROR, 409, true, context);
	}
}

export class ExternalServiceError extends BaseError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, ErrorCode.EXTERNAL_SERVICE_ERROR, 502, true, context);
	}
}

export class JobError extends BaseError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(message, ErrorCode.JOB_PROCESSING_ERROR, 500, true, context);
	}
}

export function handleError(error: unknown): AppError {
	if (error instanceof BaseError) {
		return error;
	}

	if (error instanceof Error) {
		return new BaseError(error.message, ErrorCode.INTERNAL_SERVER_ERROR, 500, false, { originalError: error.name });
	}

	return new BaseError(String(error), ErrorCode.INTERNAL_SERVER_ERROR, 500, false);
}

export function logError(error: AppError, context?: Record<string, unknown>): void {
	const logData = {
		timestamp: new Date().toISOString(),
		error: {
			message: error.message,
			code: error.code,
			statusCode: error.statusCode,
			stack: error.stack,
			context: { ...error.context, ...context }
		}
	};

	if (error.statusCode >= 500) {
		console.error('🚨 Critical Error:', JSON.stringify(logData, null, 2));
	} else {
		console.warn('⚠️ Operational Error:', JSON.stringify(logData, null, 2));
	}
}

export function isOperationalError(error: AppError): boolean {
	return error.isOperational;
}
