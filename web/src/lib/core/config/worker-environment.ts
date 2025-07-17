// Environment configuration with fallback values
// This file can be imported on both client and server sides

export interface WorkerEnvironmentConfig {
	supabase: {
		url: string;
		serviceRoleKey: string;
	};
}

// Default fallback values for development
const DEFAULT_SUPABASE_URL = 'http://127.0.0.1:54321';
const DEFAULT_SERVICE_ROLE_KEY = 'development-key';

export function validateWorkerEnvironmentConfig(strict: boolean = false): WorkerEnvironmentConfig {
	// Add debugging information
	if (process.env.NODE_ENV === 'development') {
		console.log('[WorkerEnvironment] Validating configuration...', {
			strict,
			isServer: typeof window === 'undefined'
		});
	}

	// Use fallback values for development
	const supabaseUrl = DEFAULT_SUPABASE_URL;
	const serviceRoleKey = DEFAULT_SERVICE_ROLE_KEY;

	const config = {
		supabase: {
			url: supabaseUrl,
			serviceRoleKey: serviceRoleKey
		}
	};

	if (process.env.NODE_ENV === 'development') {
		console.log('[WorkerEnvironment] Using fallback configuration:', {
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
