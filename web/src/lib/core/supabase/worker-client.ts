import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseConfig } from '../config/server-environment';

export function createWorkerClient() {
	const config = getServerSupabaseConfig();

	return createClient(config.url, config.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
