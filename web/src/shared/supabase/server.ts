// 🖥️ SERVER SUPABASE CLIENT
// This file provides a Supabase client configured for server processes
// Do not import this in client or worker code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/node-environment';
import type { Database } from '../types';

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
