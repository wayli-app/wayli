export interface NodeEnvironmentConfig {
	// Supabase Configuration
	supabase: {
		url: string;
		anonKey: string;
		serviceRoleKey: string;
	};

	// Worker Configuration
	workers: {
		maxWorkers: number;
		pollInterval: number;
		jobTimeout: number;
		retryAttempts: number;
		retryDelay: number;
	};

	// External Services
	nominatim: {
		endpoint: string;
		rateLimit: number;
	};

	pexels: {
		accessKey: string;
	};

	// Application Configuration
	app: {
		nodeEnv: string;
		isDevelopment: boolean;
		isProduction: boolean;
	};
}

export function validateNodeEnvironmentConfig(): NodeEnvironmentConfig {
	const errors: string[] = [];

	// Validate Supabase configuration
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
	if (!supabaseUrl.startsWith('http')) {
		errors.push('PUBLIC_SUPABASE_URL must be a valid URL starting with http:// or https://');
	}

	const supabaseAnonKey =
		process.env.PUBLIC_SUPABASE_ANON_KEY ||
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
	if (supabaseAnonKey.length < 20) {
		errors.push('PUBLIC_SUPABASE_ANON_KEY appears to be invalid (too short)');
	}

	const supabaseServiceRoleKey =
		process.env.SUPABASE_SERVICE_ROLE_KEY ||
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
	if (supabaseServiceRoleKey.length < 20) {
		errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
	}

	// Validate worker configuration
	const maxWorkers = parseInt(process.env.MAX_WORKERS || '2');
	if (isNaN(maxWorkers) || maxWorkers < 1 || maxWorkers > 10) {
		errors.push('MAX_WORKERS must be a number between 1 and 10');
	}

	const pollInterval = parseInt(process.env.WORKER_POLL_INTERVAL || '5000');
	if (isNaN(pollInterval) || pollInterval < 1000 || pollInterval > 30000) {
		errors.push('WORKER_POLL_INTERVAL must be a number between 1000 and 30000');
	}

	const jobTimeout = parseInt(process.env.JOB_TIMEOUT || '300000');
	if (isNaN(jobTimeout) || jobTimeout < 60000 || jobTimeout > 3600000) {
		errors.push('JOB_TIMEOUT must be a number between 60000 and 3600000');
	}

	const retryAttempts = parseInt(process.env.RETRY_ATTEMPTS || '3');
	if (isNaN(retryAttempts) || retryAttempts < 0 || retryAttempts > 10) {
		errors.push('RETRY_ATTEMPTS must be a number between 0 and 10');
	}

	const retryDelay = parseInt(process.env.RETRY_DELAY || '60000');
	if (isNaN(retryDelay) || retryDelay < 1000 || retryDelay > 300000) {
		errors.push('RETRY_DELAY must be a number between 1000 and 300000');
	}

	// Validate Nominatim configuration
	const nominatimEndpoint = process.env.NOMINATIM_ENDPOINT || 'https://nominatim.int.hazen.nu';
	if (!nominatimEndpoint.startsWith('http')) {
		errors.push('NOMINATIM_ENDPOINT must be a valid URL starting with http:// or https://');
	}

	const nominatimRateLimit = parseFloat(process.env.NOMINATIM_RATE_LIMIT || '1');
	if (isNaN(nominatimRateLimit) || nominatimRateLimit < 0.1 || nominatimRateLimit > 10) {
		errors.push('NOMINATIM_RATE_LIMIT must be a number between 0.1 and 10');
	}

	// Note: Pexels access key is optional, so we don't validate it
	const pexelsAccessKey = process.env.PEXELS_ACCESS_KEY || '';

	// Report all errors
	if (errors.length > 0) {
		console.error('Node environment configuration errors:');
		errors.forEach((error) => console.error(`- ${error}`));

		// In development, don't throw errors, just log warnings
		if (process.env.NODE_ENV === 'development') {
			console.warn(
				'⚠️  Running in development mode with default values. Some features may not work correctly.'
			);
		} else {
			throw new Error(`Node environment configuration errors: ${errors.join(', ')}`);
		}
	}

	return {
		supabase: {
			url: supabaseUrl!,
			anonKey: supabaseAnonKey!,
			serviceRoleKey: supabaseServiceRoleKey!
		},
		workers: {
			maxWorkers,
			pollInterval,
			jobTimeout,
			retryAttempts,
			retryDelay
		},
		nominatim: {
			endpoint: nominatimEndpoint,
			rateLimit: nominatimRateLimit
		},
		pexels: {
			accessKey: pexelsAccessKey
		},
		app: {
			nodeEnv: process.env.NODE_ENV || 'development',
			isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
			isProduction: (process.env.NODE_ENV || 'development') === 'production'
		}
	};
}

// Export a singleton instance
export const nodeEnv = validateNodeEnvironmentConfig();

// Helper functions for common environment checks
export function isDevelopment(): boolean {
	return nodeEnv.app.isDevelopment;
}

export function isProduction(): boolean {
	return nodeEnv.app.isProduction;
}

export function getSupabaseConfig() {
	return nodeEnv.supabase;
}

export function getWorkerConfig() {
	return nodeEnv.workers;
}

export function getNominatimConfig() {
	return nodeEnv.nominatim;
}

export function getPexelsConfig() {
	return nodeEnv.pexels;
}
