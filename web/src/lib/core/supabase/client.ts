// src/lib/core/supabase/client.ts
// Client-side Supabase client. Only uses public env vars from $env/static/public.
// Never import secrets or private env vars here.

import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './types';

// Use process.env with fallbacks for build-time compatibility
export const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
export const PUBLIC_SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || '';

// Check if environment variables are available
if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
	console.error('❌ [SUPABASE] Missing environment variables:');
	console.error('❌ [SUPABASE] PUBLIC_SUPABASE_URL:', PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
	console.error(
		'❌ [SUPABASE] PUBLIC_SUPABASE_ANON_KEY:',
		PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING'
	);
	throw new Error(
		'Supabase environment variables are required. Please check your .env.local file.'
	);
}

/**
 * The client-side Supabase instance for browser use.
 */
export const supabase = createBrowserClient<Database>(
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
);
