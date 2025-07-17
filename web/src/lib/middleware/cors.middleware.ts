interface CorsConfig {
	origin: string | string[] | boolean;
	methods?: string[];
	allowedHeaders?: string[];
	exposedHeaders?: string[];
	credentials?: boolean;
	maxAge?: number;
	preflightContinue?: boolean;
}

class CorsMiddleware {
	private config: CorsConfig;

	constructor(config: CorsConfig) {
		this.config = {
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
			allowedHeaders: [
				'Content-Type',
				'Authorization',
				'X-Requested-With',
				'Accept',
				'Origin',
				'X-Request-ID'
			],
			exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
			credentials: true,
			maxAge: 86400, // 24 hours
			preflightContinue: false,
			...config
		};
	}

	private isOriginAllowed(origin: string): boolean {
		if (this.config.origin === true) {
			return true; // Allow all origins (not recommended for production)
		}

		if (typeof this.config.origin === 'string') {
			return origin === this.config.origin;
		}

		if (Array.isArray(this.config.origin)) {
			return this.config.origin.includes(origin);
		}

		return false;
	}

	private getCorsHeaders(origin: string): Record<string, string> {
		const headers: Record<string, string> = {};

		// Set Access-Control-Allow-Origin
		if (this.isOriginAllowed(origin)) {
			headers['Access-Control-Allow-Origin'] = origin;
		}

		// Set Access-Control-Allow-Methods
		if (this.config.methods && this.config.methods.length > 0) {
			headers['Access-Control-Allow-Methods'] = this.config.methods.join(', ');
		}

		// Set Access-Control-Allow-Headers
		if (this.config.allowedHeaders && this.config.allowedHeaders.length > 0) {
			headers['Access-Control-Allow-Headers'] = this.config.allowedHeaders.join(', ');
		}

		// Set Access-Control-Expose-Headers
		if (this.config.exposedHeaders && this.config.exposedHeaders.length > 0) {
			headers['Access-Control-Expose-Headers'] = this.config.exposedHeaders.join(', ');
		}

		// Set Access-Control-Allow-Credentials
		if (this.config.credentials) {
			headers['Access-Control-Allow-Credentials'] = 'true';
		}

		// Set Access-Control-Max-Age
		if (this.config.maxAge) {
			headers['Access-Control-Max-Age'] = this.config.maxAge.toString();
		}

		return headers;
	}

	handle(request: Request): Response | null {
		const origin = request.headers.get('origin');
		const method = request.method;

		// Handle preflight requests
		if (method === 'OPTIONS') {
			const corsHeaders = this.getCorsHeaders(origin || '');

			if (this.config.preflightContinue) {
				// Return null to continue processing
				return null;
			}

			// Return preflight response
			return new Response(null, {
				status: 204,
				headers: corsHeaders
			});
		}

		// For non-preflight requests, return null to continue processing
		// The actual response will be modified by the response handler
		return null;
	}

	modifyResponse(response: Response, request: Request): Response {
		const origin = request.headers.get('origin');

		if (!origin) {
			return response;
		}

		const corsHeaders = this.getCorsHeaders(origin);

		// Create new response with CORS headers
		const newResponse = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				...Object.fromEntries(response.headers.entries()),
				...corsHeaders
			}
		});

		return newResponse;
	}
}

// Environment-based CORS configuration
function getCorsConfig(): CorsConfig {
	const isDevelopment = process.env.NODE_ENV === 'development';
	const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

	if (isDevelopment) {
		return {
			origin: ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'],
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
			allowedHeaders: [
				'Content-Type',
				'Authorization',
				'X-Requested-With',
				'Accept',
				'Origin',
				'X-Request-ID',
				'X-Client-Version'
			],
			exposedHeaders: [
				'X-Request-ID',
				'X-RateLimit-Limit',
				'X-RateLimit-Remaining',
				'X-RateLimit-Reset'
			],
			credentials: true,
			maxAge: 86400
		};
	}

	return {
		origin: allowedOrigins.length > 0 ? allowedOrigins : false,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
		allowedHeaders: [
			'Content-Type',
			'Authorization',
			'X-Requested-With',
			'Accept',
			'Origin',
			'X-Request-ID'
		],
		exposedHeaders: [
			'X-Request-ID',
			'X-RateLimit-Limit',
			'X-RateLimit-Remaining',
			'X-RateLimit-Reset'
		],
		credentials: true,
		maxAge: 86400
	};
}

// Create middleware instance
export const corsMiddleware = new CorsMiddleware(getCorsConfig());

// Helper function to apply CORS to API routes
export function withCors(handler: (request: Request, context: any) => Promise<Response>) {
	return async (context: any) => {
		const { request } = context;

		// Handle preflight requests
		const preflightResponse = corsMiddleware.handle(request);
		if (preflightResponse) {
			return preflightResponse;
		}

		// Execute the actual handler
		const response = await handler(request, context);

		// Apply CORS headers to the response
		return corsMiddleware.modifyResponse(response, request);
	};
}

// Security headers middleware
export function addSecurityHeaders(response: Response): Response {
	const securityHeaders = {
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'X-XSS-Protection': '1; mode=block',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
		'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
	};

	const newResponse = new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: {
			...Object.fromEntries(response.headers.entries()),
			...securityHeaders
		}
	});

	return newResponse;
}

// Combined middleware for API routes
export function withSecurityMiddleware(
	handler: (request: Request, context: any) => Promise<Response>
) {
	return async (context: any) => {
		const { request } = context;

		// Handle CORS
		const preflightResponse = corsMiddleware.handle(request);
		if (preflightResponse) {
			return preflightResponse;
		}

		// Execute handler
		const response = await handler(request, context);

		// Apply CORS and security headers
		const corsResponse = corsMiddleware.modifyResponse(response, request);
		return addSecurityHeaders(corsResponse);
	};
}
