import { createClient } from '@supabase/supabase-js';

import { getWorkerSupabaseConfig } from '../shared/config/worker-environment';

export function createWorkerClient() {
	const config = getWorkerSupabaseConfig();

	return createClient(config.url, config.serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
