import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Debug environment variables
console.log('🔧 [SUPABASE] Environment variables check:');
console.log('🔧 [SUPABASE] PUBLIC_SUPABASE_URL:', PUBLIC_SUPABASE_URL);
console.log('🔧 [SUPABASE] PUBLIC_SUPABASE_ANON_KEY length:', PUBLIC_SUPABASE_ANON_KEY?.length || 0);
console.log('🔧 [SUPABASE] PUBLIC_SUPABASE_ANON_KEY starts with:', PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) || 'NOT SET');

// Check if environment variables are available
if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ [SUPABASE] Missing environment variables:');
  console.error('❌ [SUPABASE] PUBLIC_SUPABASE_URL:', PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
  console.error('❌ [SUPABASE] PUBLIC_SUPABASE_ANON_KEY:', PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
  throw new Error('Supabase environment variables are required. Please check your .env.local file.');
}

export const supabase = createBrowserClient<Database>(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
);