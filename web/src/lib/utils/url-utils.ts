/**
 * URL utilities for handling local development vs production environments
 * @file src/lib/utils/url-utils.ts
 */

import { CLIENT_ENVIRONMENT } from '../environment';

/**
 * Get the base Supabase URL from environment variables
 * Falls back to PUBLIC_SUPABASE_URL if SUPABASE_URL is not available
 */
function getSupabaseBaseUrl(): string {
	// Check for specific Supabase URL first
	if (CLIENT_ENVIRONMENT.SUPABASE_URL) {
		console.log('🔗 [CONFIG] Using SUPABASE_URL:', CLIENT_ENVIRONMENT.SUPABASE_URL);
		return CLIENT_ENVIRONMENT.SUPABASE_URL;
	}

	// Fallback to PUBLIC_SUPABASE_URL
	if (CLIENT_ENVIRONMENT.PUBLIC_SUPABASE_URL) {
		console.log('🔗 [CONFIG] Using PUBLIC_SUPABASE_URL as fallback:', CLIENT_ENVIRONMENT.PUBLIC_SUPABASE_URL);
		return CLIENT_ENVIRONMENT.PUBLIC_SUPABASE_URL;
	}

	// Final fallback for local development
	console.log('🔗 [CONFIG] No environment URLs found, using localhost fallback');
	return 'http://localhost:54321';
}

/**
 * Get the base URL for API calls and storage
 * When running locally, uses Supabase's default port 54321
 * When running in production, uses the current hostname and protocol
 */
export function getBaseUrl(): string {
	if (typeof window === 'undefined') {
		// SSR - return a placeholder that will be replaced at runtime
		return getSupabaseBaseUrl();
	}

	const currentUrl = new URL(window.location.href);
	const isLocalhost = currentUrl.hostname === 'localhost' || currentUrl.hostname === '127.0.0.1';

	if (isLocalhost) {
		// When running locally, use Supabase's default port 54321
		return 'http://localhost:54321';
	} else {
		// For other environments, use the current hostname and protocol
		return `${currentUrl.protocol}//${currentUrl.host}`;
	}
}

/**
 * Get the Supabase Functions URL
 * Uses SUPABASE_FUNCTIONS_URL if available, otherwise falls back to Supabase base URL + functions path
 */
export function getFunctionsUrl(): string {
	if (CLIENT_ENVIRONMENT.SUPABASE_FUNCTIONS_URL) {
		console.log('🔗 [CONFIG] Using SUPABASE_FUNCTIONS_URL:', CLIENT_ENVIRONMENT.SUPABASE_FUNCTIONS_URL);
		return CLIENT_ENVIRONMENT.SUPABASE_FUNCTIONS_URL;
	}

	// Fallback to Supabase base URL + functions path
	const supabaseBaseUrl = getSupabaseBaseUrl();
	const fallbackUrl = `${supabaseBaseUrl}/functions/v1`;
	console.log('🔗 [CONFIG] Using fallback Functions URL:', fallbackUrl);
	return fallbackUrl;
}

/**
 * Get the Supabase Storage URL
 * Uses SUPABASE_STORAGE_URL if available, otherwise falls back to Supabase base URL
 */
export function getStorageUrl(): string {
	if (CLIENT_ENVIRONMENT.SUPABASE_STORAGE_URL) {
		console.log('🔗 [CONFIG] Using SUPABASE_STORAGE_URL:', CLIENT_ENVIRONMENT.SUPABASE_STORAGE_URL);
		return CLIENT_ENVIRONMENT.SUPABASE_STORAGE_URL;
	}

	// Fallback to Supabase base URL
	const supabaseBaseUrl = getSupabaseBaseUrl();
	console.log('🔗 [CONFIG] Using fallback Storage URL:', supabaseBaseUrl);
	return supabaseBaseUrl;
}

/**
 * Get the Supabase GraphQL URL
 * Uses SUPABASE_GRAPHQL_URL if available, otherwise falls back to Supabase base URL + graphql path
 */
export function getGraphQLUrl(): string {
	if (CLIENT_ENVIRONMENT.SUPABASE_GRAPHQL_URL) {
		console.log('🔗 [CONFIG] Using SUPABASE_GRAPHQL_URL:', CLIENT_ENVIRONMENT.SUPABASE_GRAPHQL_URL);
		return CLIENT_ENVIRONMENT.SUPABASE_GRAPHQL_URL;
	}

	// Fallback to Supabase base URL + graphql path
	const supabaseBaseUrl = getSupabaseBaseUrl();
	const fallbackUrl = `${supabaseBaseUrl}/graphql/v1`;
	console.log('🔗 [CONFIG] Using fallback GraphQL URL:', fallbackUrl);
	return fallbackUrl;
}

/**
 * Construct a Supabase Edge Function URL
 * @param functionName - The name of the Edge Function (e.g., 'owntracks-points')
 * @param params - Query parameters to append
 */
export function getEdgeFunctionUrl(functionName: string, params?: Record<string, string>): string {
	const functionsUrl = getFunctionsUrl();
	const url = new URL(`${functionsUrl}/${functionName}`);

	if (params) {
		Object.entries(params).forEach(([key, value]) => {
			url.searchParams.append(key, value);
		});
	}

	return url.toString();
}

/**
 * Construct a storage URL for files
 * @param filePath - The file path (e.g., '/trip-images/abc123.jpg')
 */
export function getStorageFileUrl(filePath: string): string {
	const storageUrl = getStorageUrl();
	return `${storageUrl}${filePath}`;
}

/**
 * Check if the current environment is localhost
 */
export function isLocalhost(): boolean {
	if (typeof window === 'undefined') {
		return false; // SSR - assume not localhost
	}

	const currentUrl = new URL(window.location.href);
	return currentUrl.hostname === 'localhost' || currentUrl.hostname === '127.0.0.1';
}

/**
 * Get the Supabase URL for the current environment
 * This is used for Supabase client configuration
 */
export function getSupabaseUrl(): string {
	if (isLocalhost()) {
		return 'http://localhost:54321';
	}

	// For production, the Supabase client will use the current origin
	// This function is mainly for local development
	return 'http://localhost:54321';
}
