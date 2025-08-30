import { corsHeaders, handleCors } from './cors.ts';
import { supabase, createUserClient } from './supabase.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Define the SupabaseClient type locally to avoid import issues
interface SupabaseClient {
	from: (table: string) => any;
	auth: any;
	// Add other methods as needed
}

export interface AuthenticatedContext {
	user: {
		id: string;
		email?: string;
		user_metadata?: Record<string, unknown>;
		app_metadata?: Record<string, unknown>;
		aud?: string;
		created_at?: string;
		updated_at?: string;
		role?: string;
	};
	supabase: SupabaseClient;
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

/**
 * Authenticate the request and return user context
 * Production-ready with proper JWT verification
 */
export async function authenticateRequest(req: Request): Promise<AuthenticatedContext> {
	const authHeader = req.headers.get('Authorization');
	if (!authHeader) {
		console.error('❌ [AUTH] No authorization header found');
		throw new Error('No authorization header');
	}

	const token = authHeader.replace('Bearer ', '');

	// Basic token format validation
	if (!token || token.length < 10) {
		console.error('❌ [AUTH] Invalid token format');
		throw new Error('Invalid token format');
	}

	// Check for common attack patterns
	if (token.includes('..') || token.includes('javascript:') || token.includes('<script>')) {
		console.error('❌ [AUTH] Malicious token pattern detected');
		throw new Error('Invalid token format');
	}

	// Log environment variables for debugging (without exposing sensitive values)
	console.log('🔍 [AUTH] Environment check:', {
		hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
		hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
		hasAnonKey: !!Deno.env.get('SUPABASE_ANON_KEY'),
		tokenLength: token.length,
		tokenPrefix: token.substring(0, 20) + '...'
	});

	try {
		// Verify the JWT token using Supabase's built-in verification
		console.log('🔍 [AUTH] Attempting JWT verification with token length:', token.length);
		const { data: { user }, error } = await supabase.auth.getUser(token);

		if (error || !user) {
			console.error('❌ [AUTH] JWT verification failed:', error);
			throw new Error('Invalid or expired JWT token');
		}

		console.log('✅ [AUTH] JWT verification successful for user:', user.id);

		// Additional security checks
		if (!user.id || typeof user.id !== 'string') {
			console.error('❌ [AUTH] Invalid user ID in token');
			throw new Error('Invalid user ID in token');
		}

		if (user.aud !== 'authenticated') {
			console.error('❌ [AUTH] Invalid token audience:', user.aud);
			throw new Error('Invalid token audience');
		}

		// Validate UUID format for user ID
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(user.id)) {
			console.error('❌ [AUTH] Invalid user ID format:', user.id);
			throw new Error('Invalid user ID format');
		}

		// Create user context with verified user data
		const userInfo = {
			id: user.id,
			email: user.email,
			user_metadata: user.user_metadata || {},
			app_metadata: user.app_metadata || {},
			aud: user.aud,
			created_at: user.created_at,
			updated_at: user.updated_at
		};

		// Create a user-specific client that respects RLS policies
		const userClient = createUserClient(token);
		return {
			user: userInfo,
			supabase: userClient
		};
	} catch (error) {
		console.error('❌ [AUTH] Authentication failed:', error);
		throw new Error('Authentication failed');
	}
}

/**
 * Authenticate request using API key + User ID from query parameters
 * Used for OwnTracks integration where authentication happens via API key + User ID in query params
 */
export async function authenticateRequestWithApiKey(req: Request): Promise<AuthenticatedContext> {
	const url = new URL(req.url);
	const apiKey = url.searchParams.get('api_key');
	const userId = url.searchParams.get('user_id');

	if (!userId) {
		console.error('❌ [AUTH] No user_id found in query parameters');
		throw new Error('user_id required in query parameters');
	}

	if (!apiKey) {
		console.error('❌ [AUTH] No api_key found in query parameters');
		throw new Error('api_key required in query parameters');
	}

	// Validate UUID format for user ID
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(userId)) {
		console.error('❌ [AUTH] Invalid user ID format:', userId);
		throw new Error('Invalid user ID format');
	}

	// Validate API key format (32 character hex string)
	if (!apiKey || apiKey.length !== 32) {
		console.error('❌ [AUTH] Invalid API key format');
		throw new Error('Invalid API key format');
	}

	try {
		// Create service role client to verify API key
		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

		if (!supabaseUrl || !supabaseServiceKey) {
			console.error('❌ [AUTH] Missing environment variables for API key verification');
			throw new Error('Server configuration error');
		}

		const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		// Get user by ID and verify API key
		const { data: { user }, error } = await serviceClient.auth.admin.getUserById(userId);

		if (error || !user) {
			console.error('❌ [AUTH] User not found:', userId);
			throw new Error('User not found');
		}

		// Check if API key matches
		const userMetadata = user.user_metadata as Record<string, unknown> || {};
		const storedApiKey = userMetadata.owntracks_api_key as string;

		if (!storedApiKey || storedApiKey !== apiKey) {
			console.error('❌ [AUTH] Invalid API key for user:', userId);
			throw new Error('Invalid API key');
		}

		console.log(`✅ [AUTH] API key authentication successful for user: ${userId}`);

		// Create user context
		const userInfo = {
			id: user.id,
			email: user.email,
			user_metadata: user.user_metadata || {},
			app_metadata: user.app_metadata || {},
			aud: user.aud,
			created_at: user.created_at,
			updated_at: user.updated_at
		};

		// Use the service role client since we've already verified the API key
		// This client can bypass RLS policies and insert data on behalf of the user
		return {
			user: userInfo,
			supabase: serviceClient
		};
	} catch (error) {
		console.error('❌ [AUTH] API key authentication failed:', error);
		throw new Error('API key authentication failed');
	}
}

/**
 * Optionally authenticate the request (for public endpoints that can work with or without auth)
 * Returns null if no valid token is provided, but doesn't throw an error
 */
export async function authenticateRequestOptional(req: Request): Promise<AuthenticatedContext | null> {
	const authHeader = req.headers.get('Authorization');
	if (!authHeader) {
		return null; // No auth header, but that's okay for optional auth
	}

	const token = authHeader.replace('Bearer ', '');
	if (!token || token.length < 10) {
		return null; // Invalid token format, but that's okay for optional auth
	}

	try {
		const { data: { user }, error } = await supabase.auth.getUser(token);

		if (error || !user || user.aud !== 'authenticated') {
			return null; // Invalid token, but that's okay for optional auth
		}

		const userInfo = {
			id: user.id,
			email: user.email,
			user_metadata: user.user_metadata || {},
			app_metadata: user.app_metadata || {},
			aud: user.aud,
			created_at: user.created_at,
			updated_at: user.updated_at
		};

		const userClient = createUserClient(token);
		return { user: userInfo, supabase: userClient };
	} catch {
			return null; // Any error means no valid auth, but that's okay
}
}

/**
 * Validate that the authenticated user has admin privileges
 * Throws an error if user is not an admin
 */
export function validateAdminRole(user: AuthenticatedContext['user']): void {
	const role = user.role || (user.app_metadata?.role as string);

	if (role !== 'admin') {
		console.error('❌ [AUTH] Admin access denied for user:', user.id);
		throw new Error('Admin access required');
	}

	console.log(`✅ [AUTH] Admin access granted for user: ${user.id}`);
}

/**
 * Validate that the authenticated user has a specific role
 * Throws an error if user doesn't have the required role
 */
export function validateUserRole(user: AuthenticatedContext['user'], requiredRole: string): void {
	const role = user.role || (user.app_metadata?.role as string);

	if (role !== requiredRole) {
		console.error(`❌ [AUTH] Role '${requiredRole}' required, user has: ${role}`);
		throw new Error(`Role '${requiredRole}' required`);
	}

	console.log(`✅ [AUTH] Role '${requiredRole}' access granted for user: ${user.id}`);
}

/**
 * Simple rate limiting helper (in-memory, not suitable for distributed systems)
 * For production, consider using Redis or similar for distributed rate limiting
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
	const now = Date.now();
	const key = identifier;
	const record = rateLimitStore.get(key);

	if (!record || now > record.resetTime) {
		// First request or window expired
		rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
		return true;
	}

	if (record.count >= maxRequests) {
		return false; // Rate limit exceeded
	}

	record.count++;
	return true;
}

/**
 * Get client IP address from request headers
 * Note: In production, ensure proper proxy configuration
 */
export function getClientIP(req: Request): string {
	const forwarded = req.headers.get('X-Forwarded-For');
	const realIP = req.headers.get('X-Real-IP');
	const cfConnectingIP = req.headers.get('CF-Connecting-IP');

	return cfConnectingIP || realIP || forwarded?.split(',')[0] || 'unknown';
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
	return input
		.replace(/[<>]/g, '') // Remove < and >
		.replace(/javascript:/gi, '') // Remove javascript: protocol
		.replace(/on\w+=/gi, '') // Remove event handlers
		.trim();
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T, status = 200): Response {
	const response: ApiResponse<T> = {
		success: true,
		data
	};

	return new Response(JSON.stringify(response), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status = 400): Response {
	const response: ApiResponse = {
		success: false,
		error: message
	};

	return new Response(JSON.stringify(response), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

/**
 * Create a message response
 */
export function messageResponse(message: string, status = 200): Response {
	const response: ApiResponse = {
		success: true,
		message
	};

	return new Response(JSON.stringify(response), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

/**
 * Handle CORS and common request setup
 */
export function setupRequest(req: Request): Response | null {
	return handleCors(req);
}

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody<T>(req: Request): Promise<T> {
	try {
		return await req.json();
	} catch {
		throw new Error('Invalid JSON body');
	}
}

/**
 * Get query parameters from URL
 */
export function getQueryParams(url: string): URLSearchParams {
	return new URL(url).searchParams;
}

/**
 * Extract path parameters from URL
 */
export function getPathParams(url: string, pattern: string): Record<string, string> {
	const urlObj = new URL(url);
	const pathParts = urlObj.pathname.split('/').filter(Boolean);
	const patternParts = pattern.split('/').filter(Boolean);

	const params: Record<string, string> = {};

	for (let i = 0; i < patternParts.length; i++) {
		if (patternParts[i].startsWith('[') && patternParts[i].endsWith(']')) {
			const paramName = patternParts[i].slice(1, -1);
			params[paramName] = pathParts[i] || '';
		}
	}

	return params;
}

/**
 * Validate required fields in an object
 */
export function validateRequiredFields(obj: Record<string, unknown>, fields: string[]): string[] {
	const missing: string[] = [];

	for (const field of fields) {
		if (!obj || obj[field] === undefined || obj[field] === null || obj[field] === '') {
			missing.push(field);
		}
	}

	return missing;
}

/**
 * Log error with context
 */
export function logError(error: unknown, context: string): void {
	console.error(`❌ [${context}] Error:`, error);
}

/**
 * Log info with context
 */
export function logInfo(message: string, context: string, data?: unknown): void {
	console.log(`ℹ️ [${context}] ${message}`, data || '');
}

/**
 * Log success with context
 */
export function logSuccess(message: string, context: string, data?: unknown): void {
	console.log(`✅ [${context}] ${message}`, data || '');
}
