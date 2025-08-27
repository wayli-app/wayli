import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Validate environment variables
if (!supabaseUrl) {
	console.error('❌ SUPABASE_URL environment variable is not set');
	throw new Error('SUPABASE_URL environment variable is required');
}

if (!supabaseServiceKey) {
	console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
	throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

console.log('🔗 [SUPABASE] Using URL:', supabaseUrl);
console.log('🔑 [SUPABASE] Service key length:', supabaseServiceKey.length);

let supabase;
try {
	supabase = createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
	console.log('✅ [SUPABASE] Client created successfully');
} catch (error) {
	console.error('❌ [SUPABASE] Failed to create client:', error);
	throw error;
}

export { supabase };

export function createAuthenticatedClient(authToken: string) {
	return createClient(supabaseUrl, supabaseServiceKey, {
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
}

// Create a client that uses the user's token for database access
export function createUserClient(authToken: string) {
	return createClient(supabaseUrl, supabaseServiceKey, {
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
}
