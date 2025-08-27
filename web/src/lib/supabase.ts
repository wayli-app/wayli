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
	}
});

// Export the config for components that need it
export { config };
