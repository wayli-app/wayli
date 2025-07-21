// Worker environment configuration using process.env
// This file is specifically for Node.js workers and uses process.env instead of SvelteKit imports

export interface WorkerEnvironmentConfig {
	supabase: {
		url: string;
		serviceRoleKey: string;
	};
}

// Default fallback values for development
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54321';
const DEFAULT_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export function validateWorkerEnvironmentConfig(strict: boolean = false): WorkerEnvironmentConfig {
	// Add debugging information
	if (process.env.NODE_ENV === 'development') {
		console.log('[WorkerEnvironment] Validating configuration...', {
			strict,
			isServer: typeof window === 'undefined',
			hasPublicUrl: !!process.env.PUBLIC_SUPABASE_URL,
			hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
		});
	}

	const errors: string[] = [];

	// Read from process.env for worker environment
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SERVICE_ROLE_KEY;

	// Validate environment variables
	if (!supabaseUrl) {
		errors.push('PUBLIC_SUPABASE_URL is not defined');
	} else if (!supabaseUrl.startsWith('http')) {
		errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://');
	}

	if (!serviceRoleKey) {
		errors.push('SUPABASE_SERVICE_ROLE_KEY is not defined');
	} else if (serviceRoleKey.length < 20 && strict) {
		errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
	}

	// Report all errors
	if (errors.length > 0) {
		console.error('Worker environment configuration errors:');
		errors.forEach((error) => console.error(`- ${error}`));

		if (strict) {
			throw new Error(`Worker environment configuration errors: ${errors.join(', ')}`);
		} else {
			console.warn('⚠️  Worker environment configuration has issues. Some features may not work correctly.');
		}
	}

	const config = {
		supabase: {
			url: supabaseUrl,
			serviceRoleKey: serviceRoleKey
		}
	};

	if (process.env.NODE_ENV === 'development') {
		console.log('[WorkerEnvironment] Configuration validated successfully:', {
			url: config.supabase.url,
			serviceKeyLength: config.supabase.serviceRoleKey.length
		});
	}

	return config;
}

// Export a singleton instance with non-strict validation for development
export const workerEnv = validateWorkerEnvironmentConfig(false);

// Helper function
export function getWorkerSupabaseConfig() {
	return workerEnv.supabase;
}

// Helper function for strict validation when needed
export function getWorkerSupabaseConfigStrict() {
	return validateWorkerEnvironmentConfig(true).supabase;
}
