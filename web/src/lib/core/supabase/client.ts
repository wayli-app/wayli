// 🖥️ CLIENT SUPABASE CLIENT
// This file provides a Supabase client configured for client-side code
// Do not import this in server or worker code

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config';
import type { Database } from '../../types';

export const supabase: SupabaseClient<Database> = createClient<Database>(
	config.supabaseUrl,
	config.supabaseAnonKey
);
