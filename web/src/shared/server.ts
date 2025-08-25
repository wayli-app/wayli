import { createSupabaseClient } from './supabase-factory';

// Use process.env with fallbacks for build-time compatibility
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create a lazy function to avoid creating the client during build time
function createServerSupabaseClient() {
	if (!SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server operations');
	}
	return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// Export a getter function instead of the client directly
export function getSupabase() {
	return createServerSupabaseClient();
}

// For backward compatibility, export the client as a property that gets created on first access
export const supabase = new Proxy({} as any, {
	get(target, prop) {
		if (!target._client) {
			target._client = createServerSupabaseClient();
		}
		return target._client[prop];
	}
});
