// ⚙️ WORKER SUPABASE CLIENT
// This file provides a Supabase client configured for worker processes
// Do not import this in client or server code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './shared/config/node-environment';
import type { Database } from './shared/types';

const config = getSupabaseConfig();

export const supabase: SupabaseClient<Database> = createClient<Database>(
	config.url,
	config.serviceRoleKey,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	}
);
