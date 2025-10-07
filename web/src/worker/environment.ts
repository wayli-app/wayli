// ⚙️ WORKER ENVIRONMENT CONFIGURATION
// This file contains environment variables and configuration that are safe
// to use in worker code (background processes)

import { ENVIRONMENT } from './shared/environment';

export const WORKER_ENVIRONMENT = {
	...ENVIRONMENT,

	// Worker-specific overrides
	IS_CLIENT: false,
	IS_SERVER: false,
	IS_WORKER: true,

	// Worker-specific feature flags
	ENABLE_JOB_LOGGING: process.env.NODE_ENV === 'development',
	ENABLE_PERFORMANCE_MONITORING: process.env.NODE_ENV === 'production',

	// Worker-specific timeouts
	JOB_TIMEOUT: 300000, // 5 minutes for job processing
	HEARTBEAT_INTERVAL: 30000, // 30 seconds for worker heartbeat

	// Worker-specific limits
	MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS || '5'),
	MAX_JOB_RETRIES: parseInt(process.env.MAX_JOB_RETRIES || '3'),

	// Worker configuration
	WORKER_POOL_SIZE: parseInt(process.env.WORKER_POOL_SIZE || '3'),
	WORKER_IDLE_TIMEOUT: parseInt(process.env.WORKER_IDLE_TIMEOUT || '60000')
} as const;

// Worker-safe logging (can include job details)
export function logWorker(
	message: string,
	level: 'info' | 'warn' | 'error' = 'info',
	jobContext?: Record<string, any>
) {
	if (WORKER_ENVIRONMENT.ENABLE_JOB_LOGGING) {
		const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
		const jobStr = jobContext ? ` | Job: ${JSON.stringify(jobContext)}` : '';
		console.log(`${emoji} [WORKER] ${message}${jobStr}`);
	}
}
