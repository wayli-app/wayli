// src/lib/supabase.ts
// Client-side Supabase client. Uses runtime configuration from WAYLI_CONFIG.
// Never import secrets or private env vars here.
// This is the SINGLE source of truth for the Supabase client in the browser.

import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import type { Database } from './types';

/**
 * The client-side Supabase instance for browser use.
 * Configured with local storage persistence for JWT tokens.
 * The URL and key are determined at runtime from WAYLI_CONFIG.
 *
 * IMPORTANT: This is the ONLY Supabase client instance that should be used
 * in client-side code to avoid multiple GoTrueClient instances.
 */
export const supabase = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: true,
		storageKey: 'wayli-auth',
		detectSessionInUrl: true
	},
	realtime: {
		params: {
			// Limit events per second to avoid quota issues
			eventsPerSecond: 10
		},
		// Connection timeout - increase from default 10s to handle slow networks
		timeout: 30000,
		// Heartbeat interval - send every 15s (well under 25s requirement)
		// This prevents connection timeouts in production
		heartbeatIntervalMs: 15000,
		// Exponential backoff for reconnection attempts
		// Starts at 1s, doubles each time, caps at 30s
		reconnectAfterMs: (tries: number) => {
			return Math.min(1000 * Math.pow(2, tries), 30000);
		}
	},
	global: {
		fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
			// Get the current session to include authorization header
			// Use localStorage directly to avoid recursive calls
			const storageKey = 'wayli-auth';
			const sessionData = localStorage.getItem(storageKey);

			let accessToken: string | null = null;
			if (sessionData) {
				try {
					const parsed = JSON.parse(sessionData);
					accessToken = parsed?.access_token || null;
				} catch {
					// Ignore parsing errors
				}
			}

			// Clone the init object to avoid mutating the original
			const modifiedInit = { ...init };

			// Add authorization header for all requests if we have a session
			if (accessToken) {
				// Ensure headers object exists
				if (!modifiedInit.headers) {
					modifiedInit.headers = {};
				}

				// Add authorization header
				(modifiedInit.headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
			}

			// Call the original fetch with modified headers
			return fetch(input, modifiedInit);
		}
	}
});

// Export the config for components that need it
export { config };
