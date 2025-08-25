/**
 * URL utilities for handling local development vs production environments
 * @file src/lib/utils/url-utils.ts
 */

/**
 * Get the base URL for API calls and storage
 * When running locally, uses Supabase's default port 54321
 * When running in production, uses the current hostname and protocol
 */
export function getBaseUrl(): string {
	if (typeof window === 'undefined') {
		// SSR - return a placeholder that will be replaced at runtime
		return 'http://localhost:54321';
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
 * Construct a Supabase Edge Function URL
 * @param functionName - The name of the Edge Function (e.g., 'owntracks-points')
 * @param params - Query parameters to append
 */
export function getEdgeFunctionUrl(functionName: string, params?: Record<string, string>): string {
	const baseUrl = getBaseUrl();
	const url = new URL(`${baseUrl}/functions/v1/${functionName}`);

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
export function getStorageUrl(filePath: string): string {
	const baseUrl = getBaseUrl();
	return `${baseUrl}${filePath}`;
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
