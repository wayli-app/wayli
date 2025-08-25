// 🖥️ SERVER ENVIRONMENT CONFIGURATION
// This file contains environment variables and configuration that are safe
// to use in server-side code (SvelteKit server)

import { ENVIRONMENT } from '$lib/shared/environment';

export const SERVER_ENVIRONMENT = {
	...ENVIRONMENT,

	// Server-specific overrides
	IS_CLIENT: false,
	IS_SERVER: true,
	IS_WORKER: false,

	// Server-side feature flags
	ENABLE_DETAILED_LOGGING: process.env.NODE_ENV === 'development',
	ENABLE_PERFORMANCE_MONITORING: process.env.NODE_ENV === 'production',

	// Server-side timeouts
	DB_TIMEOUT: 30000, // 30 seconds for database operations
	EXTERNAL_API_TIMEOUT: 15000, // 15 seconds for external API calls

	// Server-side limits
	MAX_REQUEST_SIZE: 50 * 1024 * 1024, // 50MB
	MAX_CONCURRENT_REQUESTS: 100,

	// Database configuration
	DB_POOL_SIZE: parseInt(process.env.DB_POOL_SIZE || '10'),
	DB_IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
} as const;

// Server-safe logging (can include more detailed info)
export function logServer(message: string, level: 'info' | 'warn' | 'error' = 'info', context?: Record<string, any>) {
	if (SERVER_ENVIRONMENT.ENABLE_DETAILED_LOGGING) {
		const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
		const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
		console.log(`${emoji} [SERVER] ${message}${contextStr}`);
	}
}
