import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

export function createSupabaseClient(url: string, key: string): SupabaseClient<Database> {
	return createClient<Database>(url, key, {
		auth: {
			autoRefreshToken: true,
			persistSession: true,
			storageKey: 'wayli-auth'
		}
	});
}
