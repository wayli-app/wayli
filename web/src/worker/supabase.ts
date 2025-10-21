// ⚙️ WORKER SUPABASE CLIENT
// This file provides a Supabase client configured for worker processes
// Do not import this in client or server code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { getWorkerSupabaseConfig } from '../shared/config/node-environment';
import type { Database } from '../shared/types';

// Lazy initialization of Supabase client
let supabaseClient: SupabaseClient<Database> | null = null;

function getSupabaseClient(): SupabaseClient<Database> {
	if (!supabaseClient) {
		const config = getWorkerSupabaseConfig();

		console.log('🔧 Creating Supabase client:');
		console.log('  - URL:', config.url);
		console.log('  - Service role key length:', config.serviceRoleKey.length);
		console.log('  - Anon key length:', (config as any).anonKey?.length || 0);

		supabaseClient = createClient<Database>(config.url, config.serviceRoleKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			},
			global: {
				headers: {
					'User-Agent': 'Wayli-Worker/1.0'
				},
				// Provide WebSocket implementation for Node.js environment
				fetch: fetch
			},
			realtime: {
				params: {
					eventsPerSecond: 10
				},
				// Increase timeout for slow networks
				timeout: 30000,
				// Heartbeat interval
				heartbeatIntervalMs: 15000,
				// Provide WebSocket implementation for Realtime
				transport: WebSocket as any
			}
		});

		console.log('🔧 Supabase client created with URL:', config.url);
		console.log('🔧 Supabase client service role key length:', config.serviceRoleKey.length);

		// Set the service role key as auth for Realtime
		// This ensures WebSocket connections are properly authenticated
		console.log('🔐 Setting service role key for Realtime authentication');
		supabaseClient.realtime.setAuth(config.serviceRoleKey);
	}

	return supabaseClient;
}

export const supabase = getSupabaseClient();
