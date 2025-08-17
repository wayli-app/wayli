// src/lib/core/config/server-environment.ts
// Server-side only environment configuration
// This file should ONLY be imported in server-side code (API routes, server actions, etc).
// Never import this in client-side or shared code.

import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export interface ServerEnvironmentConfig {
	supabase: {
		url: string;
		serviceRoleKey: string;
	};
}

/**
 * Validate and return the server environment config.
 * Throws in strict mode if required variables are missing.
 * @param strict - If true, throw on missing/invalid config
 * @returns {ServerEnvironmentConfig}
 */
export function validateServerEnvironmentConfig(strict: boolean = false): ServerEnvironmentConfig {
	// Add debugging information
	if (process.env.NODE_ENV === 'development') {
		console.log('[ServerEnvironment] Validating configuration...', {
			hasPublicUrl: !!PUBLIC_SUPABASE_URL,
			hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
			strict
		});
	}

	const errors: string[] = [];

	// Validate environment variables
	if (!PUBLIC_SUPABASE_URL) {
		errors.push('PUBLIC_SUPABASE_URL is not defined');
	} else if (!PUBLIC_SUPABASE_URL.startsWith('http')) {
		errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://');
	}

	if (!SUPABASE_SERVICE_ROLE_KEY) {
		errors.push('SUPABASE_SERVICE_ROLE_KEY is not defined');
	} else if (SUPABASE_SERVICE_ROLE_KEY.length < 20 && strict) {
		errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
	}

	// Report all errors
	if (errors.length > 0) {
		console.error('Server environment configuration errors:');
		errors.forEach((error) => console.error(`- ${error}`));

		if (strict) {
			throw new Error(`Server environment configuration errors: ${errors.join(', ')}`);
		} else {
			console.warn(
				'⚠️  Server environment configuration has issues. Some features may not work correctly.'
			);
		}
	}

	const config = {
		supabase: {
			url: PUBLIC_SUPABASE_URL!,
			serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY!
		}
	};

	if (process.env.NODE_ENV === 'development') {
		console.log('[ServerEnvironment] Configuration validated successfully:', {
			url: config.supabase.url,
			serviceKeyLength: config.supabase.serviceRoleKey.length
		});
	}

	return config;
}

// Export a singleton instance
export const serverEnv = validateServerEnvironmentConfig(false);

// Helper function
export function getServerSupabaseConfig() {
	return serverEnv.supabase;
}

// Helper function for strict validation when needed
export function getServerSupabaseConfigStrict() {
	return validateServerEnvironmentConfig(true).supabase;
}
