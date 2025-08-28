// ⚙️ WORKER SUPABASE CLIENT
// This file provides a Supabase client configured for worker processes
// Do not import this in client or server code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getWorkerSupabaseConfig } from '../shared/config/node-environment';
import type { Database } from '../shared/types';

const config = getWorkerSupabaseConfig();

// Enhanced debugging for connection issues
console.log('🔧 Creating Supabase client:');
console.log('  - URL:', config.url);
console.log('  - Service role key length:', config.serviceRoleKey.length);
console.log('  - Anon key length:', (config as any).anonKey?.length || 0);

export const supabase: SupabaseClient<Database> = createClient<Database>(
	config.url,
	config.serviceRoleKey,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false
		},
		global: {
			headers: {
				'User-Agent': 'Wayli-Worker/1.0'
			}
		}
	}
);
