import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './types';

export const supabase = createBrowserClient<Database>(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
);