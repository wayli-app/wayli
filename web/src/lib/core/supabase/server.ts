import { createSupabaseClient } from './supabase-factory';
import { SUPABASE_URL } from '$env/static/private';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
