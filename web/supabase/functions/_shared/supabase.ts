import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

// Validate environment variables
if (!supabaseUrl) {
	console.error('❌ SUPABASE_URL environment variable is not set');
	throw new Error('SUPABASE_URL environment variable is required');
}

if (!supabaseServiceKey) {
	console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
	throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

if (!supabaseAnonKey) {
	console.error('❌ SUPABASE_ANON_KEY environment variable is not set');
	throw new Error('SUPABASE_ANON_KEY environment variable is required');
}

let supabase: SupabaseClient;
try {
	supabase = createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
} catch (error) {
	console.error('❌ [SUPABASE] Failed to create client:', error);
	throw error;
}

export { supabase };

export function createAuthenticatedClient(authToken: string) {
	try {
		// Create a client that can verify JWT tokens
		const client = createClient(supabaseUrl!, supabaseServiceKey!, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
		return client;
	} catch (error) {
		console.error('❌ [SUPABASE] Failed to create authenticated client:', error);
		throw error;
	}
}

// Create a client that uses the user's token for database access
export function createUserClient(authToken: string) {
	try {
		const client = createClient(supabaseUrl!, supabaseServiceKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${authToken}`
				}
			},
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
		return client;
	} catch (error) {
		console.error('❌ [SUPABASE] Failed to create user client:', error);
		throw error;
	}
}
