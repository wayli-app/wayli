// 🔄 SHARED ENVIRONMENT CONFIGURATION
// This file contains environment variables and configuration that can be safely
// imported by client, server, and worker code

export const ENVIRONMENT = {
	// Environment detection
	NODE_ENV: process.env.NODE_ENV || 'development',
	IS_PRODUCTION: process.env.NODE_ENV === 'production',
	IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
	IS_TEST: process.env.NODE_ENV === 'test',

	// Application info
	APP_NAME: 'Wayli',
	APP_VERSION: process.env.npm_package_version || '1.0.0',

	// Feature flags
	ENABLE_DEBUG_LOGGING: process.env.NODE_ENV === 'development',
	ENABLE_PERFORMANCE_MONITORING: process.env.NODE_ENV === 'production',

	// Timeouts and limits
	DEFAULT_TIMEOUT: 30000, // 30 seconds
	MAX_RETRY_ATTEMPTS: 3,
	RETRY_DELAY: 1000 // 1 second
} as const;

export const LOG_LEVELS = {
	ERROR: 'error',
	WARN: 'warn',
	INFO: 'info',
	DEBUG: 'debug'
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

// Environment-specific logging
export function getLogLevel(): LogLevel {
	if (ENVIRONMENT.IS_PRODUCTION) {
		return LOG_LEVELS.INFO;
	}
	if (ENVIRONMENT.IS_TEST) {
		return LOG_LEVELS.ERROR;
	}
	return LOG_LEVELS.DEBUG;
}
