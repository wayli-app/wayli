// 🖥️ CLIENT SUPABASE CLIENT
// This file provides a Supabase client configured for client-side code
// Do not import this in server or worker code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '../types';

export const supabase: SupabaseClient<Database> = createClient<Database>(
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY
);
