import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});

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
