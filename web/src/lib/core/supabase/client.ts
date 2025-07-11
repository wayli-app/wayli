import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './types';

// Debug environment variables
console.log('🔧 [SUPABASE] Environment variables check:');
console.log('🔧 [SUPABASE] PUBLIC_SUPABASE_URL:', PUBLIC_SUPABASE_URL);
console.log('🔧 [SUPABASE] PUBLIC_SUPABASE_ANON_KEY length:', PUBLIC_SUPABASE_ANON_KEY?.length || 0);
console.log('🔧 [SUPABASE] PUBLIC_SUPABASE_ANON_KEY starts with:', PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) || 'NOT SET');

export const supabase = createBrowserClient<Database>(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
);