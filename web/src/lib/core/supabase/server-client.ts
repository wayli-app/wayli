import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getServerSupabaseConfig } from '../config/server-environment';

/**
 * Creates a Supabase client with service role key for server-side operations
 * This should only be used in server-side code (API routes, server load functions, etc.)
 */
export function createServerClient(): SupabaseClient<Database> {
	const serverConfig = getServerSupabaseConfig();
	return createClient<Database>(serverConfig.url, serverConfig.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

/**
 * Creates a Supabase client with service role key for server-side worker code only
 */
export function createWorkerServerClient(): SupabaseClient<Database> {
	const serverConfig = getServerSupabaseConfig();
	return createClient<Database>(serverConfig.url, serverConfig.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
