import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { workerManager } from '$lib/services/worker-manager.service';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			get: (key) => event.cookies.get(key),
			set: (key, value, options) => {
				event.cookies.set(key, value, { ...options, path: '/' });
			},
			remove: (key, options) => {
				event.cookies.delete(key, { ...options, path: '/' });
			}
		}
	});

	event.locals.getSession = async () => {
		const {
			data: { user }
		} = await event.locals.supabase.auth.getUser();
		if (user) {
			const { data: { session } } = await event.locals.supabase.auth.getSession();
			return session;
		}
		return null;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
};

// Initialize worker manager with configurable settings
const WORKER_CONFIG = {
	maxWorkers: parseInt(process.env.MAX_WORKERS || '2'),
	pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '5000'),
	jobTimeout: parseInt(process.env.JOB_TIMEOUT || '300000'),
	retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
	retryDelay: parseInt(process.env.RETRY_DELAY || '60000')
};

// Start the worker manager when the server starts
workerManager.start(WORKER_CONFIG).catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log('Shutting down worker manager...');
	await workerManager.stop();
	process.exit(0);
});

process.on('SIGINT', async () => {
	console.log('Shutting down worker manager...');
	await workerManager.stop();
	process.exit(0);
});
