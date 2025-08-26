// src/lib/supabase.ts
// Client-side Supabase client. Uses runtime configuration from WAYLI_CONFIG.
// Never import secrets or private env vars here.

import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import type { Database } from './types';

/**
 * The client-side Supabase instance for browser use.
 * Configured with local storage persistence for JWT tokens.
 * The URL and key are determined at runtime from WAYLI_CONFIG.
 */
export const supabase = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
	auth: {
		autoRefreshToken: true,
		persistSession: true,
		storageKey: 'wayli-auth'
	}
});
