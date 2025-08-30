import { createClient } from '@supabase/supabase-js';

import { getWorkerSupabaseConfig } from '../shared/config/worker-environment';

/**
 * Create a Supabase client for worker processes with retry logic
 */
export function createWorkerClient() {
	const config = getWorkerSupabaseConfig();

	console.log('🔗 Creating worker Supabase client with URL:', config.url);

	return createClient(config.url, config.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		},
		// Add retry logic for network failures
		global: {
			fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === 'string' ? input : input.toString();
				const options = init || {};
				const maxRetries = 3;
				const baseDelay = 1000; // 1 second

				for (let attempt = 1; attempt <= maxRetries; attempt++) {
					try {
						const response = await fetch(url, options);

						// If successful, return immediately
						if (response.ok || response.status < 500) {
							return response;
						}

						// For server errors, retry
						if (response.status >= 500 && attempt < maxRetries) {
							const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
							console.log(`⚠️  Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
							await new Promise(resolve => setTimeout(resolve, delay));
							continue;
						}

						return response;
					} catch (error) {
						// For network errors, retry
						if (attempt < maxRetries) {
							const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
							console.log(`🌐 Network error: ${error instanceof Error ? error.message : 'Unknown error'}, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
							await new Promise(resolve => setTimeout(resolve, delay));
							continue;
						}

						// If all retries failed, throw the error
						console.error('❌ All retry attempts failed for Supabase request');
						throw error;
					}
				}

				// This should never be reached, but just in case
				throw new Error('Unexpected error in retry logic');
			}
		}
	});
}
